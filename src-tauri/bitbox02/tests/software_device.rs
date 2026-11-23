//! Runs the vault of the simulator test with a software signer in place of the device, so that
//! the fixture, the sweep PSBT, the finalization and the consensus check are tested on every
//! run. Only the device is missing here. `simulator.rs` adds it.

mod support;

use bdk_wallet::{KeychainKind, SignOptions, Wallet};
use bitcoin::Network;
use support::{descriptor, sign_with, simulator_xprv, Vault};

#[test]
fn the_vault_is_unsorted_at_every_funded_address() {
  let vault = Vault::new(&simulator_xprv(), Network::Testnet);

  // The same three keys in a `sortedmulti` descriptor are a different wallet at each address
  // that the tests fund. A signer that sorted the keys would sign for that other wallet.
  let expressions = vault.keys.expressions();
  let sorted = |tail: &str| {
    let with_checksum = descriptor(&expressions, tail);
    let body = with_checksum.split('#').next().expect("a descriptor body");
    body.replace("multi(", "sortedmulti(")
  };
  let (sorted_receive, sorted_change) = (sorted("/0/*"), sorted("/1/*"));
  let sorted_wallet = Wallet::create(sorted_receive, sorted_change)
    .network(Network::Testnet)
    .create_wallet_no_persist()
    .expect("a sorted wallet");

  for (keychain, index) in [
    (KeychainKind::External, 0),
    (KeychainKind::External, 1),
    (KeychainKind::Internal, 0),
  ] {
    assert_ne!(
      vault.wallet.peek_address(keychain, index).script_pubkey(),
      sorted_wallet.peek_address(keychain, index).script_pubkey(),
      "{keychain:?} {index} is the same in an unsorted and a sorted multisig"
    );
  }
}

#[test]
fn builds_the_policy_of_the_vault_for_the_simulator_key() {
  let vault = Vault::new(&simulator_xprv(), Network::Testnet);
  let artifact = svra_bitbox02::build_policy(
    &vault.receive_descriptor,
    Some(&vault.change_descriptor),
    vault.device_fingerprint,
  )
  .expect("the policy is built");
  assert_eq!(artifact.policy, "wsh(multi(2,@0/**,@1/**,@2/**))");
  assert_eq!(
    artifact.our_key_index,
    vault
      .order
      .iter()
      .position(|position| *position == 0)
      .expect("the device is in the order")
  );
  assert_eq!(
    artifact.our_account_keypath.to_vec(),
    vec![0x8000_0030, 0x8000_0001, 0x8000_0000, 0x8000_0002]
  );

  let from_multipath =
    svra_bitbox02::build_policy(&vault.multipath_descriptor, None, vault.device_fingerprint)
      .expect("the multipath policy is built");
  assert_eq!(from_multipath.policy, artifact.policy);
}

#[test]
fn a_sweep_signed_by_two_keys_passes_the_consensus_rules() {
  let mut vault = Vault::new(&simulator_xprv(), Network::Testnet);
  let mut psbt = vault.sweep_psbt();
  assert_eq!(psbt.inputs.len(), 3);

  sign_with(&simulator_xprv(), &mut psbt);
  sign_with(&vault.keys.software_xprv, &mut psbt);
  let transaction = vault.finalize_and_verify(psbt);

  assert_eq!(transaction.input.len(), 3);
  assert!(transaction
    .input
    .iter()
    .all(|input| input.witness.len() == 4));
}

#[test]
fn a_sweep_signed_by_one_key_does_not_finalize() {
  let mut vault = Vault::new(&simulator_xprv(), Network::Testnet);
  let mut psbt = vault.sweep_psbt();
  sign_with(&simulator_xprv(), &mut psbt);
  let finalized = vault
    .wallet
    .finalize_psbt(&mut psbt, SignOptions::default())
    .expect("finalization runs");
  assert!(!finalized);
}

#[test]
fn the_cloud_key_is_written_with_a_fingerprint_and_no_path() {
  let vault = Vault::new(&simulator_xprv(), Network::Testnet);
  assert!(vault
    .receive_descriptor
    .contains(&format!("[{}]tpub", support::CLOUD_FINGERPRINT)));
}

/// Control for the tests above: the consensus check must fail on a wrong signature, or the
/// tests that rely on it prove nothing.
#[test]
#[should_panic(expected = "fails the consensus rules")]
fn the_consensus_check_rejects_a_wrong_signature() {
  let mut vault = Vault::new(&simulator_xprv(), Network::Testnet);
  let mut psbt = vault.sweep_psbt();
  sign_with(&vault.keys.software_xprv, &mut psbt);

  // Put the signature of the software key under the key of the device. It is a valid
  // signature, but not of that key.
  for input in &mut psbt.inputs {
    let wrong_signature = *input.partial_sigs.values().next().expect("a signature");
    let device_key = input
      .bip32_derivation
      .iter()
      .find(|(_, (fingerprint, _))| *fingerprint == vault.device_fingerprint)
      .map(|(key, _)| *key)
      .expect("a key of the device");
    input
      .partial_sigs
      .insert(bitcoin::PublicKey::new(device_key), wrong_signature);
  }
  vault.finalize_and_verify(psbt);
}
