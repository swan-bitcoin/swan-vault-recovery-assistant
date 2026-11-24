//! The code-entry pairing of THP: CPace over Curve25519, with the code as the password.
//!
//! The device shows a 6-digit code, and the user types it into the app. Both sides turn the code
//! and the handshake hash into a curve point (the "generator"), and the shared secret that comes
//! out proves to the device that the app knows the code.
//!
//! Where each step is defined (the firmware files are at tag `core/v2.13.1` of trezor-firmware):
//! - [`generator`] and [`host_tag`] are steps 2 to 7 of the case "the user enters code" in state
//!   HP4 of `docs/common/thp/specification.md` (the section "Code Entry pairing sequence" shows the
//!   same as a diagram). The device does the same in state TP2, steps 4 to 7:
//!   `core/src/trezor/wire/thp/cpace.py`, `Cpace.generate_keys`, and `core/src/apps/thp/pairing.py`,
//!   `_handle_code_entry_cpace`, for the tag.
//! - [`code_from_secret`] is how the device makes the code that it shows: state TP2, steps 1 and 2,
//!   in `core/src/apps/thp/pairing.py`, `_handle_code_entry_is_selected_first_time`.
//! - [`elligator2`] is the map from 32 bytes to a curve point. The device calls
//!   `trezor.crypto.elligator2.map_to_curve25519` (in `cpace.py` above), and
//!   `python/src/trezorlib/thp/curve25519.py`, `elligator2`, is the reference host. Both follow
//!   RFC 9380, section 6.7.1 (`map_to_curve_elligator2`, with `Z = 2`).
//!
//! The checked-in vectors (`tests/support/cpace-vectors.txt`) are the check of `elligator2`,
//! `generator` and `host_tag`. If you change one of them, do not regenerate the vectors from this
//! code: the vectors come from trezorlib, and a difference means that this code is wrong.

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
///
/// The field elements of the map live in registers and on the stack, and their type cannot be
/// wiped. The input is derived from the code through SHA-512, so it does not give the code away
/// directly, and it is wiped here.
pub(crate) fn elligator2(input: &[u8; 32]) -> [u8; 32] {
  let params = DynResidueParams::new(&P);
  // A u-coordinate has 255 bits, and a number above P wraps around.
  let mut bytes = Zeroizing::new(*input);
  bytes[31] &= 0x7f;
  let u = DynResidue::new(&U256::from_le_slice(&bytes[..]), params);
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
  // The padding below is 111 bytes only for a code of 6 digits, which is what the specification
  // fixes. The callers check the length of the code, so this cannot fire for a valid code.
  debug_assert_eq!(code.len(), 6);
  // CPace255's "generator string": each part comes with its length byte, and a run of zeros
  // fills the first hash block, so that the password sits in a block of its own. For a 6-digit
  // code the specification writes the bytes before and after the code as fixed strings:
  //   prefix  = 0x08 || "CPace255" || 0x06          (length of DSI, DSI, length of the code)
  //   padding = 0x6f || 0x00 repeated 111 || 0x20   (the 111 zeros end the first SHA-512 block,
  //                                                  and 0x20 is the length of the handshake hash)
  // The text that is hashed is prefix || code || padding || handshake_hash || 0x00, where the last
  // byte is the empty session id.
  const DSI: &[u8] = b"CPace255";
  let padding = HASH_BLOCK_SIZE - (1 + DSI.len() + 1 + code.len() + 1);
  // The text holds the code. The capacity is final, so that the buffer is never copied to a new
  // place that stays unwiped.
  let mut text = Zeroizing::new(Vec::with_capacity(HASH_BLOCK_SIZE + 34));
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
  let digest: Zeroizing<[u8; 64]> = Zeroizing::new(Sha512::digest(&text[..]).into());
  let mut point = Zeroizing::new([0_u8; 32]);
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
/// of low order: the shared secret would be 0 whatever the code is. The caller wipes
/// `private_key`. `x25519` takes its key by value, so the library holds one more copy on its
/// stack that this code cannot reach. The key serves one pairing and is worthless after it.
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
  let expected = Zeroizing::new(code_from_secret(handshake_hash, secret, challenge));
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

  // The vectors come from running `elligator2` and `cpace` of trezorlib 0.20.2 (the firmware's
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

  /// `tests/support/cpace-vectors.txt` holds 282 Elligator 2 inputs and 100 whole CPace exchanges
  /// that trezorlib computed. `tests/support/gen_cpace_vectors.py` writes the file and says how.
  #[test]
  fn the_code_and_the_pairing_match_trezorlib_on_the_checked_in_vectors() {
    let vectors = include_str!("../tests/support/cpace-vectors.txt");
    let (mut maps, mut exchanges) = (0, 0);
    for line in vectors.lines() {
      let fields: Vec<&str> = line.split(' ').collect();
      match fields[0] {
        "E" => {
          assert_eq!(
            elligator2(&array(fields[1])),
            array(fields[2]),
            "map {}",
            fields[1]
          );
          maps += 1;
        }
        "C" => {
          let code = fields[1].as_bytes();
          let handshake_hash = array(fields[2]);
          let tag =
            host_tag(code, &handshake_hash, &array(fields[4]), &array(fields[3])).expect("a tag");
          assert_eq!(tag.public_key, array(fields[5]), "host key {line}");
          assert_eq!(tag.tag.to_vec(), hex(fields[6]), "host tag {line}");
          // The firmware computes the same tag from its side, so it accepts the host's tag.
          assert_eq!(tag.tag.to_vec(), hex(fields[7]), "device tag {line}");
          let (secret, challenge) = (hex(fields[8]), hex(fields[9]));
          assert_eq!(
            code_from_secret(&handshake_hash, &secret, &challenge),
            fields[10],
            "code {line}"
          );
          let commitment = Sha256::digest(&secret);
          assert!(secret_matches(
            &commitment,
            &secret,
            fields[10].as_bytes(),
            &handshake_hash,
            &challenge
          ));
          exchanges += 1;
        }
        other => panic!("unknown vector kind {other}"),
      }
    }
    assert_eq!((maps, exchanges), (282, 100));
  }
}
