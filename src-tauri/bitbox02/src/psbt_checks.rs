//! Checks on the PSBT before and after the device signs it. They need no device.

use crate::error::{Error, ErrorKind};
use crate::policy::Vault;
use bitcoin::bip32::{ChildNumber, DerivationPath, Fingerprint, KeySource};
use bitcoin::blockdata::script::Builder;
use bitcoin::hashes::Hash;
use bitcoin::opcodes::all::OP_CHECKMULTISIG;
use bitcoin::psbt::{Input, Output, Psbt, PsbtSighashType};
use bitcoin::secp256k1::{Message, PublicKey as SecpPublicKey, Secp256k1};
use bitcoin::sighash::{EcdsaSighashType, SighashCache};
use bitcoin::{PublicKey, ScriptBuf, TxIn, TxOut};
use std::collections::BTreeMap;

/// The first child number of a hardened key.
const HARDENED: u32 = 0x8000_0000;

fn invalid_psbt(message: impl Into<String>) -> Error {
  Error::new(ErrorKind::InvalidPsbt, message)
}

/// The output that an input spends, after the checks that the previous transaction is the one
/// the input points to. The device needs the whole previous transaction to trust the amount.
fn spent_output<'a>(number: usize, tx_input: &TxIn, input: &'a Input) -> Result<&'a TxOut, Error> {
  let previous_transaction = input.non_witness_utxo.as_ref().ok_or_else(|| {
    invalid_psbt(format!(
      "Input {number} lacks the full previous transaction. The BitBox02 needs it to check the amount. Create the transaction again with SVRA."
    ))
  })?;
  if previous_transaction.compute_txid() != tx_input.previous_output.txid {
    return Err(invalid_psbt(format!(
      "The previous transaction of input {number} is not the transaction that the input spends. The PSBT is damaged."
    )));
  }
  let spent = previous_transaction
    .output
    .get(tx_input.previous_output.vout as usize)
    .ok_or_else(|| {
      invalid_psbt(format!(
        "Input {number} spends an output that its previous transaction does not have. The PSBT is damaged."
      ))
    })?;
  // The amount that the device signs comes from `witness_utxo` when it is there, but the device
  // checks it against the previous transaction. Reject a PSBT where the two differ.
  if input
    .witness_utxo
    .as_ref()
    .is_some_and(|witness_utxo| witness_utxo != spent)
  {
    return Err(invalid_psbt(format!(
      "Input {number} holds two different versions of the output it spends. The PSBT is damaged."
    )));
  }
  Ok(spent)
}

/// The key of the device among the key origins of an input or an output: the first key with its
/// fingerprint, as the vendor library picks it.
fn key_of_device(
  key_origins: &BTreeMap<SecpPublicKey, KeySource>,
  fingerprint: Fingerprint,
) -> Option<(SecpPublicKey, &DerivationPath)> {
  key_origins
    .iter()
    .find(|(_, (key_fingerprint, _))| *key_fingerprint == fingerprint)
    .map(|(public_key, (_, path))| (*public_key, path))
}

/// The key of the device in an input.
fn our_key(input: &Input, fingerprint: Fingerprint) -> Option<(SecpPublicKey, &DerivationPath)> {
  key_of_device(&input.bip32_derivation, fingerprint)
}

/// True when an input holds a taproot field. The vendor library reads the taproot key origins
/// before the BIP-32 ones, so such a field decides which key and path the device gets.
fn input_has_taproot_fields(input: &Input) -> bool {
  input.tap_key_sig.is_some()
    || !input.tap_script_sigs.is_empty()
    || !input.tap_scripts.is_empty()
    || !input.tap_key_origins.is_empty()
    || input.tap_internal_key.is_some()
    || input.tap_merkle_root.is_some()
}

/// The same for an output.
fn output_has_taproot_fields(output: &Output) -> bool {
  output.tap_internal_key.is_some()
    || output.tap_tree.is_some()
    || !output.tap_key_origins.is_empty()
}

/// The keychain and the address index of `path`, when `path` is the account keypath of the
/// device followed by a keychain and an address index. `None` when the path does not fit the
/// vault.
fn address_steps(vault: &Vault, path: &DerivationPath) -> Option<[ChildNumber; 2]> {
  let account = vault.artifact.our_account_keypath.to_vec();
  let numbers = path.to_u32_vec();
  if numbers.len() != account.len() + 2 || !numbers.starts_with(&account) {
    return None;
  }
  let keychain = numbers[account.len()];
  let index = numbers[account.len() + 1];
  if keychain > 1 || index >= HARDENED {
    return None;
  }
  Some([
    ChildNumber::Normal { index: keychain },
    ChildNumber::Normal { index },
  ])
}

/// The public key that the vault has for its key number `key_index` at `steps`.
fn vault_public_key(
  vault: &Vault,
  key_index: usize,
  steps: &[ChildNumber; 2],
) -> Option<SecpPublicKey> {
  let key = vault.artifact.keys.get(key_index)?;
  let child = key
    .xpub
    .derive_pub(&Secp256k1::verification_only(), steps)
    .ok()?;
  Some(child.public_key)
}

/// The witness script that the vault has at `steps`.
fn vault_witness_script(vault: &Vault, steps: &[ChildNumber; 2]) -> Option<ScriptBuf> {
  let mut script = Builder::new().push_int(vault.threshold as i64);
  for key_index in 0..vault.artifact.keys.len() {
    let key = vault_public_key(vault, key_index, steps)?;
    script = script.push_key(&PublicKey::new(key));
  }
  Some(
    script
      .push_int(vault.artifact.keys.len() as i64)
      .push_opcode(OP_CHECKMULTISIG)
      .into_script(),
  )
}

/// Checks that the device can sign every input and that every input belongs to the vault.
/// Returns the public key of the device for each input.
pub(crate) fn precheck(
  psbt: &Psbt,
  fingerprint: Fingerprint,
  vault: &Vault,
) -> Result<Vec<SecpPublicKey>, Error> {
  if psbt.unsigned_tx.input.is_empty() {
    return Err(invalid_psbt(
      "The transaction has no inputs, so there is nothing to sign.",
    ));
  }
  if psbt.inputs.len() != psbt.unsigned_tx.input.len() {
    return Err(invalid_psbt(
      "The PSBT does not have one input record for each transaction input. The PSBT is damaged.",
    ));
  }

  let mut keys = Vec::with_capacity(psbt.inputs.len());
  for (index, (tx_input, input)) in psbt.unsigned_tx.input.iter().zip(&psbt.inputs).enumerate() {
    let number = index + 1;
    if input_has_taproot_fields(input) {
      return Err(invalid_psbt(format!(
        "Input {number} has taproot fields, but a Swan vault is not a taproot wallet. The PSBT is damaged, or it comes from another wallet."
      )));
    }
    let spent = spent_output(number, tx_input, input)?;

    let witness_script = input.witness_script.as_ref().ok_or_else(|| {
      invalid_psbt(format!(
        "Input {number} lacks the witness script. Create the transaction again with SVRA."
      ))
    })?;
    if ScriptBuf::new_p2wsh(&witness_script.wscript_hash()) != spent.script_pubkey {
      return Err(invalid_psbt(format!(
        "The witness script of input {number} does not match the output that the input spends. The PSBT is damaged."
      )));
    }

    if input
      .sighash_type
      .is_some_and(|sighash_type| sighash_type != PsbtSighashType::from(EcdsaSighashType::All))
    {
      return Err(invalid_psbt(format!(
        "Input {number} asks for a signature type other than SIGHASH_ALL. SVRA signs only with SIGHASH_ALL."
      )));
    }

    let (public_key, path) = our_key(input, fingerprint).ok_or_else(|| {
      invalid_psbt(format!(
        "Input {number} has no key path for the connected BitBox02 (fingerprint {fingerprint}). Check that this BitBox02 holds a key of the vault, and that the PSBT comes from the same vault."
      ))
    })?;
    let steps = address_steps(vault, path);
    if steps
      .as_ref()
      .and_then(|steps| vault_witness_script(vault, steps))
      .as_ref()
      != Some(witness_script)
    {
      return Err(invalid_psbt(format!(
        "Input {number} does not belong to the vault of the descriptors. Check that the transaction and the descriptors come from the same vault."
      )));
    }
    // The fingerprint in the PSBT is only a label. The key under it must be the key that the
    // vault has for the device, or a PSBT could pass another key off as the device's key and
    // make the device look as if it had signed.
    let device_key = steps
      .as_ref()
      .and_then(|steps| vault_public_key(vault, vault.artifact.our_key_index, steps));
    if device_key != Some(public_key) {
      return Err(invalid_psbt(format!(
        "Input {number} lists a key for the connected BitBox02 (fingerprint {fingerprint}) that is not the key of the BitBox02 in the vault. The PSBT is damaged, or it comes from another vault."
      )));
    }
    keys.push(public_key);
  }
  check_outputs(psbt, fingerprint, vault)?;
  Ok(keys)
}

/// Checks the outputs that claim to belong to the device. The device does not show such an output
/// as a payment, so its script must be the vault's script at the key path that the PSBT gives.
fn check_outputs(psbt: &Psbt, fingerprint: Fingerprint, vault: &Vault) -> Result<(), Error> {
  if psbt.outputs.len() != psbt.unsigned_tx.output.len() {
    return Err(invalid_psbt(
      "The PSBT does not have one output record for each transaction output. The PSBT is damaged.",
    ));
  }
  for (index, (tx_output, output)) in psbt
    .unsigned_tx
    .output
    .iter()
    .zip(&psbt.outputs)
    .enumerate()
  {
    let number = index + 1;
    if output_has_taproot_fields(output) {
      return Err(invalid_psbt(format!(
        "Output {number} has taproot fields, but a Swan vault is not a taproot wallet. The PSBT is damaged, or it comes from another wallet."
      )));
    }
    let Some((_, path)) = key_of_device(&output.bip32_derivation, fingerprint) else {
      continue;
    };
    let vault_script = address_steps(vault, path)
      .and_then(|steps| vault_witness_script(vault, &steps))
      .map(|witness_script| ScriptBuf::new_p2wsh(&witness_script.wscript_hash()));
    if vault_script.as_ref() != Some(&tx_output.script_pubkey) {
      return Err(invalid_psbt(format!(
        "Output {number} says that it pays to an address of the vault, but its script is not the vault's script at that key path. The BitBox02 would not show it as a payment. The PSBT is damaged, or someone changed it."
      )));
    }
  }
  Ok(())
}

/// Checks the signature of `key` on one input of `psbt` against the BIP-143 hash of the
/// transaction, with the witness script and the amount from the input.
fn check_signature(psbt: &Psbt, index: usize, key: &SecpPublicKey) -> Result<(), String> {
  let number = index + 1;
  let input = psbt
    .inputs
    .get(index)
    .ok_or_else(|| format!("Input {number} is missing."))?;
  let signature = input
    .partial_sigs
    .get(&PublicKey::new(*key))
    .ok_or_else(|| format!("The BitBox02 returned no signature for input {number}."))?;
  if signature.sighash_type != EcdsaSighashType::All {
    return Err(format!(
      "The signature for input {number} does not use SIGHASH_ALL."
    ));
  }
  let witness_script = input
    .witness_script
    .as_ref()
    .ok_or_else(|| format!("Input {number} has no witness script."))?;
  let amount = psbt
    .spend_utxo(index)
    .map_err(|_| format!("Input {number} has no output to check the signature against."))?
    .value;
  let sighash = SighashCache::new(&psbt.unsigned_tx)
    .p2wsh_signature_hash(index, witness_script, amount, EcdsaSighashType::All)
    .map_err(|_| format!("Cannot compute the hash to check the signature of input {number}."))?;
  Secp256k1::verification_only()
    .verify_ecdsa(
      &Message::from_digest(sighash.to_byte_array()),
      &signature.signature,
      key,
    )
    .map_err(|_| format!("The signature for input {number} is not valid."))
}

/// True when every input already holds a valid signature of the device's key.
pub(crate) fn already_signed(psbt: &Psbt, keys: &[SecpPublicKey]) -> bool {
  !keys.is_empty()
    && keys.len() == psbt.inputs.len()
    && keys
      .iter()
      .enumerate()
      .all(|(index, key)| check_signature(psbt, index, key).is_ok())
}

fn unexpected_change() -> Error {
  Error::new(
    ErrorKind::Other,
    "Signing changed the PSBT in an unexpected way. Do not use the result.",
  )
}

/// Checks the PSBT that the device library returned. The transaction must be the one that went
/// in, only signatures of the device's key may be new, and each of them must verify.
pub(crate) fn verify_signed(
  original: &Psbt,
  signed: &Psbt,
  keys: &[SecpPublicKey],
) -> Result<(), Error> {
  if bitcoin::consensus::serialize(&original.unsigned_tx)
    != bitcoin::consensus::serialize(&signed.unsigned_tx)
  {
    return Err(Error::new(
      ErrorKind::TransactionMismatch,
      "The BitBox02 returned a different transaction than the one SVRA sent. Do not use the result. Someone may have changed the transaction.",
    ));
  }
  if signed.inputs.len() != original.inputs.len() || keys.len() != original.inputs.len() {
    return Err(unexpected_change());
  }

  let foreign_signatures = |input: &Input, key: &SecpPublicKey| -> BTreeMap<_, _> {
    let ours = PublicKey::new(*key);
    input
      .partial_sigs
      .iter()
      .filter(|(signer, _)| **signer != ours)
      .map(|(signer, signature)| (*signer, *signature))
      .collect()
  };
  for ((before, after), key) in original.inputs.iter().zip(&signed.inputs).zip(keys) {
    if foreign_signatures(before, key) != foreign_signatures(after, key) {
      return Err(unexpected_change());
    }
  }

  let without_signatures = |psbt: &Psbt| {
    let mut copy = psbt.clone();
    for input in &mut copy.inputs {
      input.partial_sigs.clear();
    }
    copy
  };
  if without_signatures(original) != without_signatures(signed) {
    return Err(unexpected_change());
  }

  // Everything except the signatures equals the PSBT that went in, so the script and the amount
  // that each signature is checked against are the ones the caller sent.
  for (index, key) in keys.iter().enumerate() {
    check_signature(signed, index, key).map_err(|message| {
      Error::new(
        ErrorKind::InvalidSignature,
        format!("{message} Do not use the result."),
      )
    })?;
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::policy::parse_vault;
  use crate::test_support::{
    descriptor, fingerprint_of, master_key, sign_with, simulator_xprv, Vault as Fixture, ORDERS,
  };
  use bitcoin::bip32::KeySource;
  use bitcoin::{absolute::LockTime, transaction, Amount, Network, NetworkKind, Transaction};

  struct Case {
    fixture: Fixture,
    vault: Vault,
    psbt: Psbt,
    fingerprint: Fingerprint,
  }

  /// A funded vault of the simulator key with the sweep PSBT, and the vault as the session
  /// builds it for that device.
  fn case() -> Case {
    let mut fixture = Fixture::new(&simulator_xprv(), Network::Testnet);
    let psbt = fixture.sweep_psbt();
    let fingerprint = fingerprint_of(&simulator_xprv());
    let vault = parse_vault(
      &fixture.receive_descriptor,
      Some(&fixture.change_descriptor),
    )
    .expect("the descriptors are valid")
    .for_device(fingerprint)
    .expect("the device is in the vault");
    Case {
      fixture,
      vault,
      psbt,
      fingerprint,
    }
  }

  fn precheck_error(case: &Case, psbt: &Psbt) -> Error {
    match precheck(psbt, case.fingerprint, &case.vault) {
      Ok(_) => panic!("the pre-check passed, but it should fail"),
      Err(error) => {
        assert_eq!(error.kind, ErrorKind::InvalidPsbt, "{}", error.message);
        error
      }
    }
  }

  fn device_keys(case: &Case) -> Vec<SecpPublicKey> {
    precheck(&case.psbt, case.fingerprint, &case.vault).expect("the pre-check passes")
  }

  fn signed_by_device(case: &Case) -> Psbt {
    let mut psbt = case.psbt.clone();
    sign_with(&simulator_xprv(), &mut psbt);
    psbt
  }

  #[test]
  fn the_sweep_spends_inputs_of_both_keychains_in_an_unsorted_vault() {
    let case = case();
    assert_eq!(case.psbt.inputs.len(), 3);
    let keychains: Vec<u32> = case
      .psbt
      .inputs
      .iter()
      .map(|input| {
        let (_, path) = our_key(input, case.fingerprint).expect("a key of the device");
        path.to_u32_vec()[4]
      })
      .collect();
    assert!(
      keychains.contains(&0) && keychains.contains(&1),
      "{keychains:?}"
    );
  }

  #[test]
  fn a_vault_psbt_passes_the_pre_check_and_returns_the_key_of_the_device_for_each_input() {
    let case = case();
    let keys = precheck(&case.psbt, case.fingerprint, &case.vault).expect("the pre-check passes");
    assert_eq!(keys.len(), case.psbt.inputs.len());
    for (key, input) in keys.iter().zip(&case.psbt.inputs) {
      assert!(input.bip32_derivation.contains_key(key));
    }
  }

  #[test]
  fn refuses_a_psbt_without_inputs() {
    let case = case();
    let empty = Psbt::from_unsigned_tx(Transaction {
      version: transaction::Version::TWO,
      lock_time: LockTime::ZERO,
      input: vec![],
      output: vec![],
    })
    .expect("an empty PSBT");
    let error = precheck_error(&case, &empty);
    assert!(error.message.contains("no inputs"), "{}", error.message);
  }

  #[test]
  fn refuses_an_input_without_the_previous_transaction() {
    let mut case = case();
    case.psbt.inputs[1].non_witness_utxo = None;
    let error = precheck_error(&case, &case.psbt);
    assert!(error.message.contains("Input 2"), "{}", error.message);
    assert!(
      error.message.contains("previous transaction"),
      "{}",
      error.message
    );
  }

  #[test]
  fn refuses_a_previous_transaction_that_the_input_does_not_spend() {
    let mut case = case();
    let mut other = case.psbt.inputs[0]
      .non_witness_utxo
      .clone()
      .expect("a previous tx");
    other.lock_time = LockTime::from_consensus(1);
    case.psbt.inputs[0].non_witness_utxo = Some(other);
    let error = precheck_error(&case, &case.psbt);
    assert!(error.message.contains("input 1"), "{}", error.message);
    assert!(error.message.contains("damaged"), "{}", error.message);
  }

  #[test]
  fn refuses_a_witness_utxo_that_differs_from_the_previous_transaction() {
    let mut case = case();
    let mut witness_utxo = case.psbt.inputs[0]
      .witness_utxo
      .clone()
      .expect("a witness utxo");
    witness_utxo.value += Amount::from_sat(1);
    case.psbt.inputs[0].witness_utxo = Some(witness_utxo);
    let error = precheck_error(&case, &case.psbt);
    assert!(error.message.contains("two different"), "{}", error.message);
  }

  #[test]
  fn refuses_an_input_without_a_witness_script() {
    let mut case = case();
    case.psbt.inputs[2].witness_script = None;
    let error = precheck_error(&case, &case.psbt);
    assert!(error.message.contains("Input 3"), "{}", error.message);
    assert!(
      error.message.contains("witness script"),
      "{}",
      error.message
    );
  }

  #[test]
  fn refuses_a_witness_script_that_does_not_hash_to_the_spent_script() {
    let mut case = case();
    let mut script = case.psbt.inputs[0]
      .witness_script
      .clone()
      .expect("a script")
      .into_bytes();
    let last = script.len() - 1;
    script[last] ^= 0x01;
    case.psbt.inputs[0].witness_script = Some(ScriptBuf::from_bytes(script));
    let error = precheck_error(&case, &case.psbt);
    assert!(
      error.message.contains("does not match"),
      "{}",
      error.message
    );
  }

  #[test]
  fn refuses_an_input_without_a_key_of_the_device() {
    let case = case();
    let other = fingerprint_of(&master_key(0x77, NetworkKind::Test));
    match precheck(&case.psbt, other, &case.vault) {
      Ok(_) => panic!("the pre-check passed"),
      Err(error) => {
        assert_eq!(error.kind, ErrorKind::InvalidPsbt);
        assert!(error.message.contains("Input 1"), "{}", error.message);
        assert!(
          error.message.contains(&other.to_string()),
          "{}",
          error.message
        );
      }
    }
  }

  #[test]
  fn refuses_a_sighash_type_other_than_all() {
    let mut case = case();
    case.psbt.inputs[0].sighash_type = Some(EcdsaSighashType::SinglePlusAnyoneCanPay.into());
    let error = precheck_error(&case, &case.psbt);
    assert!(error.message.contains("SIGHASH_ALL"), "{}", error.message);
  }

  #[test]
  fn accepts_the_sighash_type_all() {
    let mut case = case();
    case.psbt.inputs[0].sighash_type = Some(EcdsaSighashType::All.into());
    assert!(precheck(&case.psbt, case.fingerprint, &case.vault).is_ok());
  }

  #[test]
  fn refuses_a_key_path_that_does_not_fit_the_vault() {
    let mut case = case();
    let input = &mut case.psbt.inputs[0];
    let (public_key, (fingerprint, path)) = input
      .bip32_derivation
      .iter()
      .find(|(_, (fingerprint, _))| *fingerprint == case.fingerprint)
      .map(|(key, source)| (*key, source.clone()))
      .expect("a key of the device");
    // An account other than the one in the descriptor.
    let mut numbers = path.to_u32_vec();
    numbers[2] += 1;
    let moved: DerivationPath = numbers
      .into_iter()
      .map(ChildNumber::from)
      .collect::<Vec<_>>()
      .into();
    input
      .bip32_derivation
      .insert(public_key, (fingerprint, moved));
    let error = precheck_error(&case, &case.psbt);
    assert!(
      error.message.contains("does not belong"),
      "{}",
      error.message
    );
  }

  #[test]
  fn refuses_a_psbt_that_puts_the_fingerprint_of_the_device_on_another_key() {
    // The script and the paths are the vault's, so only the key under the fingerprint of the
    // device is wrong: it is the key of the cosigner, derived at the same path.
    let mut case = case();
    let secp = Secp256k1::new();
    let software_xprv = case.fixture.keys.software_xprv;
    for input in &mut case.psbt.inputs {
      let (device_key, (_, path)) = input
        .bip32_derivation
        .iter()
        .find(|(_, (fingerprint, _))| *fingerprint == case.fingerprint)
        .map(|(key, source)| (*key, source.clone()))
        .expect("a key of the device");
      let cosigner_key = software_xprv
        .derive_priv(&secp, &path)
        .expect("the path derives")
        .private_key
        .public_key(&secp);
      assert_ne!(cosigner_key, device_key);
      assert!(input.bip32_derivation.contains_key(&cosigner_key));
      input.bip32_derivation.remove(&device_key);
      input
        .bip32_derivation
        .insert(cosigner_key, (case.fingerprint, path));
    }
    let error = precheck_error(&case, &case.psbt);
    assert!(
      error.message.contains("not the key of the BitBox02"),
      "{}",
      error.message
    );
  }

  /// The key of the device in input 0 and its key origin.
  fn device_key_origin(case: &Case) -> (SecpPublicKey, KeySource) {
    case.psbt.inputs[0]
      .bip32_derivation
      .iter()
      .find(|(_, (fingerprint, _))| *fingerprint == case.fingerprint)
      .map(|(key, source)| (*key, source.clone()))
      .expect("a key of the device")
  }

  #[test]
  fn refuses_taproot_fields_on_an_input() {
    let case = case();
    let (device_key, source) = device_key_origin(&case);
    let x_only = device_key.x_only_public_key().0;
    let mut psbt = case.psbt.clone();
    psbt.inputs[1].tap_internal_key = Some(x_only);
    let error = precheck_error(&case, &psbt);
    assert!(error.message.contains("Input 2"), "{}", error.message);
    assert!(error.message.contains("taproot"), "{}", error.message);

    // The device fingerprint under a taproot key origin is what the vendor library reads first.
    let mut psbt = case.psbt.clone();
    psbt.inputs[0]
      .tap_key_origins
      .insert(x_only, (vec![], source));
    let error = precheck_error(&case, &psbt);
    assert!(error.message.contains("taproot"), "{}", error.message);
  }

  #[test]
  fn refuses_taproot_fields_on_an_output() {
    let mut case = case();
    let (device_key, source) = device_key_origin(&case);
    case.psbt.outputs[0].tap_internal_key = Some(device_key.x_only_public_key().0);
    let error = precheck_error(&case, &case.psbt);
    assert!(error.message.contains("Output 1"), "{}", error.message);
    assert!(error.message.contains("taproot"), "{}", error.message);

    case.psbt.outputs[0].tap_internal_key = None;
    case.psbt.outputs[0]
      .tap_key_origins
      .insert(device_key.x_only_public_key().0, (vec![], source));
    let error = precheck_error(&case, &case.psbt);
    assert!(error.message.contains("taproot"), "{}", error.message);
  }

  #[test]
  fn refuses_an_output_that_claims_a_vault_address_but_pays_elsewhere() {
    // The sweep pays to a key of the cosigner. Listing the key path of the device on that output
    // would make the device treat it as an address of the wallet and not show it.
    let mut case = case();
    let (device_key, source) = device_key_origin(&case);
    case.psbt.outputs[0]
      .bip32_derivation
      .insert(device_key, source);
    let error = precheck_error(&case, &case.psbt);
    assert!(error.message.contains("Output 1"), "{}", error.message);
    assert!(
      error.message.contains("not the vault's script"),
      "{}",
      error.message
    );
  }

  #[test]
  fn refuses_an_output_with_a_key_path_that_is_not_in_the_vault() {
    let mut case = case();
    let (device_key, (fingerprint, path)) = device_key_origin(&case);
    let mut numbers = path.to_u32_vec();
    numbers[2] += 1;
    let moved: DerivationPath = numbers
      .into_iter()
      .map(ChildNumber::from)
      .collect::<Vec<_>>()
      .into();
    case.psbt.unsigned_tx.output[0].script_pubkey = case.psbt.inputs[0]
      .witness_utxo
      .clone()
      .expect("a utxo")
      .script_pubkey;
    case.psbt.outputs[0]
      .bip32_derivation
      .insert(device_key, (fingerprint, moved));
    let error = precheck_error(&case, &case.psbt);
    assert!(error.message.contains("Output 1"), "{}", error.message);
  }

  #[test]
  fn accepts_an_output_that_is_an_address_of_the_vault() {
    // Sweeping to an address of the same wallet: the output lists the key path of the device,
    // and its script is the vault's script at that path.
    let mut case = case();
    let (device_key, source) = device_key_origin(&case);
    case.psbt.unsigned_tx.output[0].script_pubkey = case.psbt.inputs[0]
      .witness_utxo
      .clone()
      .expect("a utxo")
      .script_pubkey;
    case.psbt.outputs[0]
      .bip32_derivation
      .insert(device_key, source);
    case.psbt.outputs[0].witness_script = case.psbt.inputs[0].witness_script.clone();
    precheck(&case.psbt, case.fingerprint, &case.vault).expect("the pre-check passes");
  }

  #[test]
  fn refuses_a_psbt_of_another_vault_with_the_same_device() {
    // The same three keys in another order: the other wallet that a sorted multisig would give.
    let case = case();
    let other_order = ORDERS
      .into_iter()
      .find(|order| *order != case.fixture.order)
      .expect("another order");
    let expressions = case.fixture.keys.expressions();
    let ordered: Vec<&str> = other_order
      .iter()
      .map(|position| expressions[*position])
      .collect();
    let other = parse_vault(&descriptor(&ordered, "/0/*"), None)
      .expect("a valid descriptor")
      .for_device(case.fingerprint)
      .expect("the device is in the vault");
    match precheck(&case.psbt, case.fingerprint, &other) {
      Ok(_) => panic!("the pre-check passed"),
      Err(error) => {
        assert_eq!(error.kind, ErrorKind::InvalidPsbt);
        assert!(
          error.message.contains("does not belong"),
          "{}",
          error.message
        );
      }
    }
  }

  #[test]
  fn the_vault_script_equals_the_one_that_the_wallet_builds() {
    let case = case();
    for input in &case.psbt.inputs {
      let (_, path) = our_key(input, case.fingerprint).expect("a key of the device");
      let steps = address_steps(&case.vault, path).expect("an address of the vault");
      assert_eq!(
        vault_witness_script(&case.vault, &steps).as_ref(),
        input.witness_script.as_ref()
      );
    }
  }

  #[test]
  fn an_unsigned_psbt_is_not_signed() {
    let case = case();
    assert!(!already_signed(&case.psbt, &device_keys(&case)));
  }

  #[test]
  fn a_psbt_with_a_valid_signature_on_every_input_is_signed() {
    let case = case();
    let signed = signed_by_device(&case);
    assert!(already_signed(&signed, &device_keys(&case)));
  }

  #[test]
  fn a_psbt_with_a_signature_on_some_inputs_is_not_signed() {
    let case = case();
    let mut signed = signed_by_device(&case);
    signed.inputs[1].partial_sigs.clear();
    assert!(!already_signed(&signed, &device_keys(&case)));
  }

  #[test]
  fn the_signature_of_another_key_does_not_count() {
    let case = case();
    let mut psbt = case.psbt.clone();
    sign_with(&case.fixture.keys.software_xprv, &mut psbt);
    assert!(!already_signed(&psbt, &device_keys(&case)));
  }

  #[test]
  fn a_signature_that_does_not_verify_does_not_count() {
    let case = case();
    let mut signed = signed_by_device(&case);
    let keys = device_keys(&case);
    let other = signed.inputs[1].partial_sigs[&PublicKey::new(keys[1])];
    signed.inputs[0]
      .partial_sigs
      .insert(PublicKey::new(keys[0]), other);
    assert!(!already_signed(&signed, &keys));
  }

  fn verify_error(case: &Case, signed: &Psbt) -> Error {
    match verify_signed(&case.psbt, signed, &device_keys(case)) {
      Ok(()) => panic!("the verification passed, but it should fail"),
      Err(error) => error,
    }
  }

  #[test]
  fn accepts_a_correct_signature_on_every_input() {
    let case = case();
    let signed = signed_by_device(&case);
    verify_signed(&case.psbt, &signed, &device_keys(&case)).expect("the result is valid");
  }

  #[test]
  fn accepts_the_device_signature_next_to_a_signature_of_another_key() {
    let mut case = case();
    sign_with(&case.fixture.keys.software_xprv, &mut case.psbt);
    let signed = signed_by_device(&case);
    verify_signed(&case.psbt, &signed, &device_keys(&case)).expect("the result is valid");
    assert_eq!(signed.inputs[0].partial_sigs.len(), 2);
  }

  #[test]
  fn accepts_a_new_signature_where_the_device_had_signed_before() {
    let mut case = case();
    case.psbt = signed_by_device(&case);
    let signed = signed_by_device(&case);
    verify_signed(&case.psbt, &signed, &device_keys(&case)).expect("the result is valid");
  }

  #[test]
  fn rejects_a_signature_that_does_not_verify() {
    let case = case();
    let mut signed = signed_by_device(&case);
    let keys = device_keys(&case);
    let other = signed.inputs[1].partial_sigs[&PublicKey::new(keys[1])];
    signed.inputs[0]
      .partial_sigs
      .insert(PublicKey::new(keys[0]), other);
    let error = verify_error(&case, &signed);
    assert_eq!(error.kind, ErrorKind::InvalidSignature);
    assert!(error.message.contains("input 1"), "{}", error.message);
  }

  #[test]
  fn rejects_a_signature_made_with_another_key_under_the_key_of_the_device() {
    let case = case();
    let mut signed = case.psbt.clone();
    sign_with(&case.fixture.keys.software_xprv, &mut signed);
    let keys = device_keys(&case);
    // Move each signature of the software key under the key of the device.
    for (input, key) in signed.inputs.iter_mut().zip(&keys) {
      let signature = *input.partial_sigs.values().next().expect("a signature");
      input.partial_sigs.clear();
      input.partial_sigs.insert(PublicKey::new(*key), signature);
    }
    let error = verify_error(&case, &signed);
    assert_eq!(error.kind, ErrorKind::InvalidSignature);
  }

  #[test]
  fn rejects_a_missing_signature() {
    let case = case();
    let mut signed = signed_by_device(&case);
    signed.inputs[2].partial_sigs.clear();
    let error = verify_error(&case, &signed);
    assert_eq!(error.kind, ErrorKind::InvalidSignature);
    assert!(error.message.contains("input 3"), "{}", error.message);
  }

  #[test]
  fn rejects_a_signature_with_another_sighash_type() {
    let case = case();
    let mut signed = signed_by_device(&case);
    let keys = device_keys(&case);
    signed.inputs[0]
      .partial_sigs
      .get_mut(&PublicKey::new(keys[0]))
      .expect("a signature")
      .sighash_type = EcdsaSighashType::None;
    let error = verify_error(&case, &signed);
    assert_eq!(error.kind, ErrorKind::InvalidSignature);
    assert!(error.message.contains("SIGHASH_ALL"), "{}", error.message);
  }

  #[test]
  fn rejects_a_changed_transaction() {
    let case = case();
    let mut signed = signed_by_device(&case);
    signed.unsigned_tx.output[0].value -= Amount::from_sat(1);
    let error = verify_error(&case, &signed);
    assert_eq!(error.kind, ErrorKind::TransactionMismatch);
  }

  #[test]
  fn rejects_a_changed_output_script_even_when_the_signatures_are_valid_for_it() {
    // A device that signs a different transaction produces valid signatures for that one.
    let case = case();
    let mut tampered = case.psbt.clone();
    tampered.unsigned_tx.output[0].value -= Amount::from_sat(1_000);
    sign_with(&simulator_xprv(), &mut tampered);
    let error = verify_error(&case, &tampered);
    assert_eq!(error.kind, ErrorKind::TransactionMismatch);
  }

  #[test]
  fn rejects_a_signature_of_a_key_that_is_not_the_device() {
    let case = case();
    let mut signed = signed_by_device(&case);
    // The device library adds a signature that nobody asked for.
    let mut software = case.psbt.clone();
    sign_with(&case.fixture.keys.software_xprv, &mut software);
    let (key, signature) = software.inputs[0]
      .partial_sigs
      .iter()
      .next()
      .map(|(key, signature)| (*key, *signature))
      .expect("a signature");
    signed.inputs[0].partial_sigs.insert(key, signature);
    let error = verify_error(&case, &signed);
    assert_eq!(error.kind, ErrorKind::Other);
  }

  #[test]
  fn rejects_a_change_to_anything_but_signatures() {
    let case = case();
    let mut signed = signed_by_device(&case);
    signed.inputs[0].sighash_type = Some(EcdsaSighashType::All.into());
    assert_eq!(verify_error(&case, &signed).kind, ErrorKind::Other);

    let mut signed = signed_by_device(&case);
    signed.inputs[1].witness_script = None;
    assert_eq!(verify_error(&case, &signed).kind, ErrorKind::Other);

    let mut signed = signed_by_device(&case);
    signed.outputs[0].bip32_derivation.clear();
    signed.outputs[0].proprietary.insert(
      bitcoin::psbt::raw::ProprietaryKey {
        prefix: b"x".to_vec(),
        subtype: 0,
        key: vec![],
      },
      vec![1],
    );
    assert_eq!(verify_error(&case, &signed).kind, ErrorKind::Other);
  }
}
