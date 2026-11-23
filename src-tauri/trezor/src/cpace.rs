//! The code-entry pairing of THP: CPace over Curve25519, with the code as the password.
//!
//! The device shows a 6-digit code, and the user types it into the app. Both sides turn the code
//! and the handshake hash into a curve point (the "generator"), and the shared secret that comes
//! out proves to the device that the app knows the code. The firmware's `cpace.py` and the THP
//! specification's "Code Entry" section define the steps. The map from a hash to a curve point
//! is Elligator 2 for Curve25519, as RFC 9380, section 6.7.1, gives it.

use crypto_bigint::modular::runtime_mod::{DynResidue, DynResidueParams};
use crypto_bigint::{Encoding, U256};
use sha2::{Digest, Sha256, Sha512};
use subtle::{ConditionallySelectable, ConstantTimeEq};
use zeroize::Zeroizing;

/// The field modulus `2^255 - 19`.
const P: U256 =
  U256::from_be_hex("7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed");
/// `P - 2`: raising to this power inverts a field element, and maps 0 to 0.
const P_MINUS_2: U256 =
  U256::from_be_hex("7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeb");
/// `(P - 1) / 2`: raising to this power gives 1 for a square, and -1 for a non-square.
const P_MINUS_1_OVER_2: U256 =
  U256::from_be_hex("3ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6");
/// The Montgomery curve's `A` coefficient.
const J: u64 = 486_662;

/// The block size of SHA-512. The generator string is padded to this size.
const HASH_BLOCK_SIZE: usize = 128;

/// Maps 32 bytes to the u-coordinate of a point on Curve25519 (RFC 9380, `map_to_curve_elligator2`
/// for curve25519, with the non-optimised steps). The code is the secret input, so every step
/// runs in constant time. The result depends on the number only, not on how long it takes.
pub(crate) fn elligator2(input: &[u8; 32]) -> [u8; 32] {
  let params = DynResidueParams::new(&P);
  // A u-coordinate has 255 bits, and a number above P wraps around.
  let mut bytes = *input;
  bytes[31] &= 0x7f;
  let u = DynResidue::new(&U256::from_le_slice(&bytes), params);
  let one = DynResidue::one(params);
  let j = DynResidue::new(&U256::from_u64(J), params);
  let minus_j = j.neg();

  // x1 = -J / (1 + 2 u^2). The denominator is never 0, because -1/2 is not a square.
  let denominator = u.square().add(&u.square()).add(&one);
  let x1 = minus_j.mul(&denominator.pow(&P_MINUS_2));
  // gx1 = x1^3 + J x1^2 + x1
  let gx1 = x1.add(&j).mul(&x1).add(&one).mul(&x1);
  let x2 = x1.neg().sub(&j);

  let is_square = !gx1
    .pow(&P_MINUS_1_OVER_2)
    .retrieve()
    .ct_eq(&one.neg().retrieve());
  let x = U256::conditional_select(&x2.retrieve(), &x1.retrieve(), is_square);
  x.to_le_bytes()
}

/// The generator of the code: the point that the password blinds. `code` is the ASCII digits.
/// `handshake_hash` binds the code to this channel.
pub(crate) fn generator(code: &[u8], handshake_hash: &[u8; 32]) -> [u8; 32] {
  // CPace255's "generator string": each part comes with its length byte, and a run of zeros
  // fills the first hash block, so that the password sits in a block of its own.
  const DSI: &[u8] = b"CPace255";
  let padding = HASH_BLOCK_SIZE - (1 + DSI.len() + 1 + code.len() + 1);
  let mut text = Vec::with_capacity(HASH_BLOCK_SIZE + 34);
  text.push(DSI.len() as u8);
  text.extend_from_slice(DSI);
  text.push(code.len() as u8);
  text.extend_from_slice(code);
  text.push(padding as u8);
  text.extend(std::iter::repeat_n(0_u8, padding));
  text.push(handshake_hash.len() as u8);
  text.extend_from_slice(handshake_hash);
  // The session id is empty.
  text.push(0);
  let digest = Sha512::digest(&text);
  let mut point = [0_u8; 32];
  point.copy_from_slice(&digest[..32]);
  elligator2(&point)
}

/// What the app sends to the device after the user typed the code.
pub(crate) struct HostTag {
  pub public_key: [u8; 32],
  pub tag: [u8; 32],
}

/// Computes the message that proves to the device that the app knows `code`.
///
/// `private_key` is 32 random bytes, used once. Returns `None` when the device's key is a point
/// of low order: the shared secret would be 0 whatever the code is.
pub(crate) fn host_tag(
  code: &[u8],
  handshake_hash: &[u8; 32],
  trezor_public_key: &[u8; 32],
  private_key: &[u8; 32],
) -> Option<HostTag> {
  let generator = generator(code, handshake_hash);
  let public_key = x25519_dalek::x25519(*private_key, generator);
  let shared_secret = Zeroizing::new(x25519_dalek::x25519(*private_key, *trezor_public_key));
  if bool::from(shared_secret.ct_eq(&[0_u8; 32])) {
    return None;
  }
  let mut tag = [0_u8; 32];
  tag.copy_from_slice(&Sha256::digest(*shared_secret));
  Some(HostTag { public_key, tag })
}

/// The code that the device derives from its secret, the host's challenge and the handshake: the
/// last 6 decimal digits of a hash. The host checks it against the code that the user typed.
pub(crate) fn code_from_secret(
  handshake_hash: &[u8; 32],
  secret: &[u8],
  challenge: &[u8],
) -> String {
  const CODE_ENTRY: u8 = 2;
  let mut hash = Sha256::new();
  hash.update([CODE_ENTRY]);
  hash.update(handshake_hash);
  hash.update(secret);
  hash.update(challenge);
  let digest = hash.finalize();
  // The digest is a big-endian number. Reduce it one byte at a time.
  let number = digest.iter().fold(0_u64, |rest, byte| {
    (rest * 256 + u64::from(*byte)) % 1_000_000
  });
  format!("{number:06}")
}

/// Checks the secret that the device reveals at the end of the pairing: it must match the
/// commitment that the device sent at the start, and it must give the code that the user typed.
pub(crate) fn secret_matches(
  commitment: &[u8],
  secret: &[u8],
  code: &[u8],
  handshake_hash: &[u8; 32],
  challenge: &[u8],
) -> bool {
  let committed = bool::from(Sha256::digest(secret).as_slice().ct_eq(commitment));
  let expected = code_from_secret(handshake_hash, secret, challenge);
  committed && bool::from(expected.as_bytes().ct_eq(code))
}

#[cfg(test)]
mod tests {
  use super::*;

  fn hex(text: &str) -> Vec<u8> {
    (0..text.len())
      .step_by(2)
      .map(|index| u8::from_str_radix(&text[index..index + 2], 16).expect("hex"))
      .collect()
  }

  fn array(text: &str) -> [u8; 32] {
    hex(text).try_into().expect("32 bytes")
  }

  // The vectors come from running `elligator2` and `cpace` of trezorlib 0.20 (the firmware's
  // reference host) on these inputs.
  #[test]
  fn elligator2_matches_the_reference_host() {
    let vectors = [
      (
        "0000000000000000000000000000000000000000000000000000000000000000",
        "0000000000000000000000000000000000000000000000000000000000000000",
      ),
      (
        "0100000000000000000000000000000000000000000000000000000000000000",
        "9cdb525555555555555555555555555555555555555555555555555555555555",
      ),
      (
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        "5f3520001c6c9936a31206afe7c7ac224e8861619bf98872444915899d95f46e",
      ),
      // The top bit is dropped, and a number above the modulus wraps around.
      (
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        "1e5942dd97c756040d27755f1e5b11349cd47d796c45d07052f7e5b11541c349",
      ),
      (
        "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
        "9cdb525555555555555555555555555555555555555555555555555555555555",
      ),
      (
        "f2ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
        "e967a8afafafafafafafafafafafafafafafafafafafafafafafafafafafaf2f",
      ),
      (
        "030a11181f262d343b424950575e656c737a81888f969da4abb2b9c0c7ced5dc",
        "a88d9ad01bebc99b5588d0295b0aaed616f41b609e1436b04d558b253c64077e",
      ),
    ];
    for (input, expected) in vectors {
      assert_eq!(elligator2(&array(input)), array(expected), "input {input}");
    }
  }

  #[test]
  fn the_host_tag_matches_the_reference_host() {
    let handshake_hash = array("6465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f80818283");
    let private_key = array("0104070a0d101316191c1f2225282b2e3134373a3d404346494c4f5255585b5e");
    let trezor_key = array("6b30d44eb54fdfea64880ad60e0f56f400b322a7de43b8d007ff118032c99312");
    let shared = array("f8f2428a7418ec03c7857a3a1be03ca2e5d3353363932911b3014cb021d5925a");

    let first = host_tag(b"123456", &handshake_hash, &trezor_key, &private_key).expect("a tag");
    assert_eq!(
      first.public_key,
      array("67c5727be5d9fb49d1a8d7850e2cd079bd4cadebbd789cf34efd42c89c159d7d")
    );
    assert_eq!(first.tag.as_slice(), Sha256::digest(shared).as_slice());

    // A code with leading zeros keeps them: the password is the 6 characters.
    let second = host_tag(b"000007", &handshake_hash, &trezor_key, &private_key).expect("a tag");
    assert_eq!(
      second.public_key,
      array("8a62251f3ebdd67605fe1607a605488be73b9c1d20f42bd00beb12ea2f21c100")
    );
    // The shared secret does not depend on the code on the host's side.
    assert_eq!(first.tag, second.tag);
  }

  #[test]
  fn a_key_of_low_order_is_refused() {
    let hash = [7_u8; 32];
    assert!(host_tag(b"123456", &hash, &[0_u8; 32], &[9_u8; 32]).is_none());
    let mut one = [0_u8; 32];
    one[0] = 1;
    assert!(host_tag(b"123456", &hash, &one, &[9_u8; 32]).is_none());
  }

  #[test]
  fn the_two_sides_agree_when_the_code_is_right_and_differ_when_it_is_wrong() {
    // The device's step, as the specification gives it: its public key is its private key times
    // the generator of the code that it shows.
    let hash = [3_u8; 32];
    let device_private = [11_u8; 32];
    let host_private = [13_u8; 32];
    let device_public = x25519_dalek::x25519(device_private, generator(b"482915", &hash));

    let right = host_tag(b"482915", &hash, &device_public, &host_private).expect("a tag");
    let device_shared = x25519_dalek::x25519(device_private, right.public_key);
    assert_eq!(
      right.tag.as_slice(),
      Sha256::digest(device_shared).as_slice()
    );

    let wrong = host_tag(b"482916", &hash, &device_public, &host_private).expect("a tag");
    let device_shared = x25519_dalek::x25519(device_private, wrong.public_key);
    assert_ne!(
      wrong.tag.as_slice(),
      Sha256::digest(device_shared).as_slice()
    );
  }

  #[test]
  fn the_code_comes_from_the_last_digits_of_the_hash() {
    // SHA-256 of 0x02 || 32 x 0x01 || "secret" || "challenge", read as a number, modulo 10^6.
    let code = code_from_secret(&[1_u8; 32], b"secret", b"challenge");
    assert_eq!(code.len(), 6);
    assert!(code.bytes().all(|byte| byte.is_ascii_digit()));
    let digest = {
      let mut hash = Sha256::new();
      hash.update([2_u8]);
      hash.update([1_u8; 32]);
      hash.update(b"secret");
      hash.update(b"challenge");
      hash.finalize()
    };
    // Independent reduction: the tail of the number in decimal.
    let mut number = [0_u8; 32];
    number.copy_from_slice(&digest);
    let mut rest = 0_u128;
    for byte in number {
      rest = (rest * 256 + u128::from(byte)) % 1_000_000;
    }
    assert_eq!(code, format!("{rest:06}"));
  }

  #[test]
  fn the_secret_must_match_the_commitment_and_the_code() {
    let hash = [5_u8; 32];
    let secret = [8_u8; 16];
    let challenge = [4_u8; 16];
    let commitment = Sha256::digest(secret);
    let code = code_from_secret(&hash, &secret, &challenge);
    assert!(secret_matches(
      &commitment,
      &secret,
      code.as_bytes(),
      &hash,
      &challenge
    ));
    assert!(
      !secret_matches(&commitment, &secret, b"000000", &hash, &challenge) || code == "000000"
    );
    assert!(!secret_matches(
      &[0_u8; 32],
      &secret,
      code.as_bytes(),
      &hash,
      &challenge
    ));
    assert!(!secret_matches(
      &commitment,
      &[9_u8; 16],
      code.as_bytes(),
      &hash,
      &challenge
    ));
  }
}
