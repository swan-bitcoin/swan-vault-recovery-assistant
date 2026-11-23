//! Signs a Swan vault with the vendor's firmware simulator.
//!
//! Run with `BITBOX02_SIMULATOR=<absolute path of the simulator> cargo test -p svra_bitbox02
//! --features simulator --test simulator`. The simulator ships for Linux on x86-64 only.
//!
//! Each test starts its own simulator on the default port 15423 and stops it at the end, so the
//! tests take turns. The simulator confirms every prompt on its own, which is how the vendor's
//! own tests drive it.
#![cfg(feature = "simulator")]

mod support;

use bitbox_api::btc::KeyOriginInfo;
use bitbox_api::pb::btc_register_script_config_request::XPubType;
use bitbox_api::pb::BtcCoin;
use bitbox_api::runtime::TokioRuntime;
use bitbox_api::{BitBox, NoiseConfigNoCache};
use bitcoin::bip32::Xpub;
use bitcoin::psbt::Psbt;
use bitcoin::secp256k1::Secp256k1;
use bitcoin::{Network, NetworkKind};
use std::future::Future;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, MutexGuard};
use support::{account_path, master_key, sign_with, simulator_xprv, Vault};
use svra_bitbox02::{sign_psbt, Error, ErrorKind, Progress, SignOutcome, SignRequest, POLICY_NAME};

/// One simulator at a time, because all of them listen on the same port.
static ONE_AT_A_TIME: Mutex<()> = Mutex::new(());

fn one_at_a_time() -> MutexGuard<'static, ()> {
  // A failed test poisons the lock. The next test must still run.
  ONE_AT_A_TIME
    .lock()
    .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// A running simulator process. It stops when this value is dropped.
struct Simulator(Child);

impl Simulator {
  fn start() -> Simulator {
    let path = std::env::var("BITBOX02_SIMULATOR").unwrap_or_else(|_| {
      panic!(
        "BITBOX02_SIMULATOR is not set. Set it to the absolute path of the BitBox02 firmware simulator executable."
      )
    });
    assert!(
      Path::new(&path).is_absolute(),
      "BITBOX02_SIMULATOR must be an absolute path, but it is {path}"
    );
    let child = Command::new(&path)
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
      .unwrap_or_else(|error| panic!("cannot start the simulator {path}: {error}"));
    Simulator(child)
  }
}

impl Drop for Simulator {
  fn drop(&mut self) {
    // Every client is gone by now, so the client side closed the connections first and the port
    // is free for the next simulator.
    let _ = self.0.kill();
    let _ = self.0.wait();
  }
}

/// Runs a future on the current thread, the way the app runs a device session.
fn run<F: Future>(future: F) -> F::Output {
  tokio::runtime::Builder::new_current_thread()
    .enable_time()
    .build()
    .expect("a runtime")
    .block_on(future)
}

/// A new connection to the simulator, which the simulator waits for for about two seconds.
async fn connect() -> BitBox<TokioRuntime> {
  BitBox::<TokioRuntime>::from_simulator(None, Box::new(NoiseConfigNoCache {}))
    .await
    .expect("cannot connect to the simulator")
}

/// A new simulator has no wallet. This gives it the wallet that the vendor's tests use, as they
/// do, and closes the connection again so that the code under test connects as the app does.
async fn seed_simulator() {
  let paired = connect()
    .await
    .unlock_and_pair()
    .await
    .expect("the simulator unlocks and pairs")
    .wait_confirm()
    .await
    .expect("the simulator confirms the pairing");
  paired
    .restore_from_mnemonic()
    .await
    .expect("the simulator restores its wallet");
}

fn label(progress: &Progress) -> &'static str {
  match progress {
    Progress::Connecting => "connecting",
    Progress::Unlock => "unlock",
    Progress::ConfirmPairing { .. } => "confirm-pairing",
    Progress::CheckingRegistration => "checking-registration",
    Progress::Register => "register",
    Progress::Sign => "sign",
  }
}

fn labels(events: &[Progress]) -> Vec<&'static str> {
  events.iter().map(label).collect()
}

/// One call of `sign_psbt` on a new connection, with the progress events it reported.
async fn sign(
  vault: &Vault,
  network: Network,
  psbt: Psbt,
) -> (Result<SignOutcome, Error>, Vec<Progress>) {
  let device = connect().await;
  let mut events = Vec::new();
  let result = sign_psbt(
    device,
    SignRequest {
      network,
      receive_descriptor: &vault.receive_descriptor,
      change_descriptor: Some(&vault.change_descriptor),
      psbt,
    },
    &mut |progress| events.push(progress),
  )
  .await;
  (result, events)
}

/// Checks that the device signed every input, and nobody else did, and that the PSBT is still
/// the same transaction.
fn assert_signed_by_the_device_only(unsigned: &Psbt, signed: &Psbt, vault: &Vault) {
  assert_eq!(signed.unsigned_tx, unsigned.unsigned_tx);
  assert_eq!(signed.inputs.len(), unsigned.inputs.len());
  for (before, after) in unsigned.inputs.iter().zip(&signed.inputs) {
    assert!(before.partial_sigs.is_empty());
    assert_eq!(after.partial_sigs.len(), 1);
    let (signer, _) = after.partial_sigs.iter().next().expect("one signature");
    let (_, (fingerprint, _)) = after
      .bip32_derivation
      .iter()
      .find(|(key, _)| bitcoin::PublicKey::new(**key) == *signer)
      .expect("the signer has a key origin in the input");
    assert_eq!(*fingerprint, vault.device_fingerprint);
  }
}

/// Signs and registers, then signs again with the registration in place, then asks again after
/// the device has signed. This is the first run of an unsorted `wsh(multi())` vault with an
/// origin-less cloud key on a device that follows the real firmware.
#[test]
fn signs_registers_and_reuses_the_registration() {
  let _turn = one_at_a_time();
  let _simulator = Simulator::start();
  run(async {
    seed_simulator().await;
    let mut vault = Vault::new(&simulator_xprv(), Network::Testnet);
    let unsigned = vault.sweep_psbt();

    // The first call registers the vault and signs.
    let (result, events) = sign(&vault, Network::Testnet, unsigned.clone()).await;
    let first = result.expect("the first signing works");
    assert_eq!(
      labels(&events),
      [
        "unlock",
        "confirm-pairing",
        "checking-registration",
        "register",
        "sign"
      ]
    );
    assert!(
      events
        .iter()
        .any(|event| matches!(event, Progress::ConfirmPairing { code } if !code.is_empty())),
      "the pairing code is empty"
    );
    assert!(first.registered, "the first call must register the vault");
    assert!(first.signed, "the first call must sign");
    assert_eq!(first.fingerprint, vault.device_fingerprint);
    assert_signed_by_the_device_only(&unsigned, &first.psbt, &vault);

    // The second key signs in software. The unsorted multisig must accept both signatures.
    let mut both = first.psbt.clone();
    sign_with(&vault.keys.software_xprv, &mut both);
    let transaction = vault.finalize_and_verify(both);
    assert_eq!(transaction.input.len(), unsigned.inputs.len());

    // The second call finds the registration, so it does not register again.
    let (result, events) = sign(&vault, Network::Testnet, unsigned.clone()).await;
    let second = result.expect("the second signing works");
    assert_eq!(
      labels(&events),
      ["unlock", "confirm-pairing", "checking-registration", "sign"]
    );
    assert!(
      !second.registered,
      "the second call must not register again"
    );
    assert!(second.signed);
    assert_signed_by_the_device_only(&unsigned, &second.psbt, &vault);

    // A PSBT that the device already signed comes back as it is, with no more prompts.
    let (result, events) = sign(&vault, Network::Testnet, first.psbt.clone()).await;
    let third = result.expect("the third call works");
    assert_eq!(labels(&events), ["unlock", "confirm-pairing"]);
    assert!(!third.signed, "the device had signed every input already");
    assert!(!third.registered);
    assert_eq!(third.psbt, first.psbt);
    assert_eq!(third.fingerprint, vault.device_fingerprint);
  });
}

/// A new simulator has no wallet. The firmware answers the unlock request with a status that the
/// device library ignores, so pairing works and the session must notice the empty device itself.
#[test]
fn refuses_a_device_without_a_wallet() {
  let _turn = one_at_a_time();
  let _simulator = Simulator::start();
  run(async {
    let mut vault = Vault::new(&simulator_xprv(), Network::Testnet);
    let psbt = vault.sweep_psbt();

    let (result, events) = sign(&vault, Network::Testnet, psbt).await;
    let error = match result {
      Ok(_) => panic!("a device without a wallet signed"),
      Err(error) => error,
    };
    assert_eq!(error.kind, ErrorKind::NotInitialized, "{}", error.message);
    assert_eq!(labels(&events), ["unlock", "confirm-pairing"]);
  });
}

/// A device that holds no key of the vault must not be asked to register or sign anything.
#[test]
fn refuses_a_vault_without_a_key_of_the_device() {
  let _turn = one_at_a_time();
  let _simulator = Simulator::start();
  run(async {
    seed_simulator().await;
    let someone_else = master_key(0x77, NetworkKind::Test);
    let mut vault = Vault::new(&someone_else, Network::Testnet);
    let psbt = vault.sweep_psbt();

    let (result, events) = sign(&vault, Network::Testnet, psbt).await;
    let error = match result {
      Ok(_) => panic!("the device signed a vault that it holds no key of"),
      Err(error) => error,
    };
    assert_eq!(error.kind, ErrorKind::KeyNotInVault, "{}", error.message);
    assert_eq!(labels(&events), ["unlock", "confirm-pairing"]);
    assert!(
      error
        .message
        .contains(&support::fingerprint_of(&simulator_xprv()).to_string()),
      "the message names the fingerprint of the device: {}",
      error.message
    );
  });
}

/// A device that holds another wallet under the name `swan_vault` refuses a second one.
#[test]
fn reports_a_name_that_another_wallet_holds() {
  let _turn = one_at_a_time();
  let _simulator = Simulator::start();
  run(async {
    seed_simulator().await;

    // Register another policy, of two keys, under the name that the vault uses.
    {
      let secp = Secp256k1::new();
      let path = account_path(NetworkKind::Test);
      let account = simulator_xprv()
        .derive_priv(&secp, &path)
        .expect("the account derives");
      let other_account = master_key(0x42, NetworkKind::Test)
        .derive_priv(&secp, &path)
        .expect("the account derives");
      let keys = [
        KeyOriginInfo {
          root_fingerprint: Some(support::fingerprint_of(&simulator_xprv())),
          keypath: Some((&path).into()),
          xpub: Xpub::from_priv(&secp, &account),
        },
        KeyOriginInfo {
          root_fingerprint: None,
          keypath: None,
          xpub: Xpub::from_priv(&secp, &other_account),
        },
      ];
      let config = bitbox_api::btc::make_script_config_policy("wsh(multi(2,@0/**,@1/**))", &keys);
      let paired = connect()
        .await
        .unlock_and_pair()
        .await
        .expect("unlock and pair")
        .wait_confirm()
        .await
        .expect("confirm the pairing");
      paired
        .btc_register_script_config(
          BtcCoin::Tbtc,
          &config,
          None,
          XPubType::AutoXpubTpub,
          Some(POLICY_NAME),
        )
        .await
        .expect("the simulator registers the other wallet");
    }

    let mut vault = Vault::new(&simulator_xprv(), Network::Testnet);
    let psbt = vault.sweep_psbt();
    let (result, events) = sign(&vault, Network::Testnet, psbt).await;
    let error = match result {
      Ok(_) => panic!("the device registered a second wallet under the same name"),
      Err(error) => error,
    };
    assert_eq!(error.kind, ErrorKind::PolicyNameTaken, "{}", error.message);
    assert_eq!(
      labels(&events),
      [
        "unlock",
        "confirm-pairing",
        "checking-registration",
        "register"
      ]
    );
  });
}

/// Regtest needs firmware 9.21.0. In the firmware source of 9.27.0, `check_enabled` in
/// `policies.rs` lets only `Btc` and `Tbtc` use a wallet policy, so the device is expected to
/// refuse the vault here. The test takes both outcomes, so that it keeps passing when a firmware
/// adds regtest policies, and then it checks the signing as in the testnet test.
#[test]
fn handles_regtest() {
  let _turn = one_at_a_time();
  let _simulator = Simulator::start();
  run(async {
    seed_simulator().await;
    let mut vault = Vault::new(&simulator_xprv(), Network::Regtest);
    let unsigned = vault.sweep_psbt();

    let (result, events) = sign(&vault, Network::Regtest, unsigned.clone()).await;
    match result {
      Ok(outcome) => {
        println!("this simulator signs wallet policies on regtest");
        assert!(outcome.signed && outcome.registered);
        assert_signed_by_the_device_only(&unsigned, &outcome.psbt, &vault);
        let mut both = outcome.psbt;
        sign_with(&vault.keys.software_xprv, &mut both);
        vault.finalize_and_verify(both);
      }
      Err(error) => {
        println!("this simulator refuses wallet policies on regtest: {error}");
        match error.kind {
          ErrorKind::FirmwareTooOld => {}
          ErrorKind::Other => assert!(
            error.message.contains("regtest"),
            "the message names regtest: {}",
            error.message
          ),
          other => panic!("unexpected error {other:?}: {}", error.message),
        }
        assert!(
          !labels(&events).contains(&"sign"),
          "nothing may be signed after the refusal"
        );
      }
    }
  });
}
