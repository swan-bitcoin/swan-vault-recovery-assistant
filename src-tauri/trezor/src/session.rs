//! One signing session with a Trezor Safe 7. Three terms explain the steps below.
//!
//! Channel: the app and the device set up an encrypted channel (the Trezor Host Protocol, THP).
//! The device allocates the channel and both sides run a Noise handshake. The channel hides the
//! messages from anyone who reads the USB cable, but it does not tell the device who is on the
//! other end.
//!
//! Pairing: the device shows a 6-digit code, and the user types it into the app. The code proves
//! that the app on the screen is the one that the user is looking at. The app stores nothing
//! about the pairing, so the user types a new code on every run.
//!
//! Wallet session: the Safe 7 holds no wallet of the vault. Every signing request carries the
//! three keys of the vault, and the device signs when one of them is its own. A wallet session
//! picks the device's wallet: the standard one has an empty passphrase, and another one has the
//! passphrase that the user enters on the device.

use crate::device::Device;
use crate::device_error::{link_error, unexpected_message, Step};
use crate::error::{Error, ErrorKind};
use crate::keys::{check_features, coin_name, Matched, DEVICE_NAME, SAFE_7_MODEL};
use crate::link::{
  check_random, discard_stale_packets, Allocated, Failed, Link, LinkError, PROTOCOL_MAJOR, QUICK,
  USER,
};
use crate::proto::{ThpDeviceProperties, ThpPairingMethod};
use crate::signing::prepare;
use crate::transport::Transport;
use bitcoin::bip32::Fingerprint;
use bitcoin::psbt::Psbt;
use svra_vault::{already_signed, parse_vault, precheck, verify_signed};
use trezor_thp::channel::PairingState;

/// Oldest firmware of the Safe 7. It is the first release, so every Safe 7 that runs firmware
/// passes this check. The check stays because the firmware reports its version anyway.
pub const MIN_FIRMWARE_VERSION: semver::Version = semver::Version::new(2, 9, 3);

/// The session of the standard wallet and the session of the wallet with a passphrase. The
/// device wants a new number for each session of a channel. Session 0 is for the messages that
/// need no wallet.
const STANDARD_WALLET_SESSION: u8 = 1;
const PASSPHRASE_WALLET_SESSION: u8 = 2;

/// What the device session is doing, so the app can tell the user where to look. A normal run
/// reports `Connecting`, `ConfirmConnection`, `EnterPairingCode`, `CheckingKey` and `Sign`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Progress {
  /// Opening the device and the channel.
  Connecting,
  /// The device is locked and waits for the user's PIN.
  Unlock,
  /// The user must allow the connection on the device.
  ConfirmConnection,
  /// The device shows a 6-digit code, and the app must ask the user for it. The session goes on
  /// when [`Ui::pairing_code`] returns.
  EnterPairingCode,
  /// Reading the device's key and comparing it with the vault.
  CheckingKey,
  /// The user must enter the passphrase on the device.
  Passphrase,
  /// The user must confirm the transaction on the device.
  Sign,
}

/// How the session talks to the user.
pub trait Ui {
  /// Reports a step. Return quickly: the session waits for it.
  fn progress(&mut self, progress: Progress);

  /// Blocks until the user typed the code that the device shows. `None` means that the user
  /// cancelled.
  fn pairing_code(&mut self) -> Option<String>;
}

/// One signing attempt.
pub struct SignRequest<'a> {
  pub network: bitcoin::Network,
  /// Receive descriptor (`.../0/*`) or multipath descriptor (`.../<0;1>/*`).
  pub receive_descriptor: &'a str,
  /// Optional change descriptor (`.../1/*`).
  pub change_descriptor: Option<&'a str>,
  pub psbt: Psbt,
}

pub struct SignOutcome {
  /// The PSBT, with the device's signatures added when `signed` is true.
  pub psbt: Psbt,
  /// False when the device's key had already signed every input, so nothing was added.
  pub signed: bool,
  /// Root fingerprint of the device that signed.
  pub fingerprint: Fingerprint,
}

/// Checks what the device says about itself before the handshake: the model and the protocol.
fn check_properties(properties: &ThpDeviceProperties) -> Result<(), Error> {
  if properties.internal_model != SAFE_7_MODEL {
    return Err(Error::new(
      ErrorKind::Other,
      "The connected Trezor is not a Trezor Safe 7. SVRA signs with a Trezor Safe 7 in this way. Other Trezor models work through the hardware wallet tool, so unplug this one and connect a Trezor Safe 7, or use that tool.",
    ));
  }
  let code_entry = properties
    .pairing_methods
    .contains(&(ThpPairingMethod::CodeEntry as i32));
  if properties.protocol_version_major != PROTOCOL_MAJOR || !code_entry {
    return Err(Error::new(
      ErrorKind::Other,
      "This Trezor Safe 7 speaks a version of the connection protocol that SVRA does not know. Update SVRA to the newest version, then try again.",
    ));
  }
  Ok(())
}

/// Opens a channel to the device: allocation and handshake. A locked device gets a second try
/// that asks it to show its PIN screen, and the user unlocks it there.
pub(crate) fn connect<T: Transport>(
  transport: T,
  ui: &mut dyn Ui,
) -> Result<(Link<T>, PairingState), Error> {
  let fail = |failed: Failed<T>| link_error(failed.error, Step::Connect);
  if !check_random() {
    return Err(Error::new(
      ErrorKind::Other,
      "SVRA cannot get random numbers from the operating system, so it cannot open a secure connection. Restart your computer and try again.",
    ));
  }
  let mut transport = transport;
  // An earlier session may have left packets in the device's queue.
  discard_stale_packets(&mut transport).map_err(|error| link_error(error, Step::Connect))?;

  let allocated = Allocated::allocate(transport, false).map_err(fail)?;
  check_properties(&allocated.properties)?;
  match allocated.handshake(QUICK) {
    Ok(opened) => Ok(opened),
    Err(Failed {
      error: LinkError::DeviceLocked,
      transport,
    }) => {
      ui.progress(Progress::Unlock);
      let unlock = |failed: Failed<T>| link_error(failed.error, Step::Unlock);
      let allocated = Allocated::allocate(transport, true).map_err(unlock)?;
      check_properties(&allocated.properties)?;
      allocated.handshake(USER).map_err(unlock)
    }
    Err(failed) => Err(fail(failed)),
  }
}

/// Runs one signing attempt on an opened device: pair, find the vault key, check the
/// transaction, sign, verify.
///
/// This call blocks until the user finishes on the device. It returns an error of kind
/// [`ErrorKind::PairingRejected`] when the pairing code was wrong, and of kind
/// [`ErrorKind::UserAbort`] when the user cancelled on the device or in the app.
pub fn sign_psbt<T: Transport>(
  transport: T,
  request: SignRequest<'_>,
  ui: &mut dyn Ui,
) -> Result<SignOutcome, Error> {
  let coin = coin_name(request.network)?;
  // Read the descriptors first, so that a descriptor the app cannot use fails before the user
  // has to pair the device.
  parse_vault(
    DEVICE_NAME,
    request.receive_descriptor,
    request.change_descriptor,
  )?;

  ui.progress(Progress::Connecting);
  let (link, state) = connect(transport, ui)?;
  let mut device = Device::new(link, ui);
  let result = run(&mut device, state, request, coin);
  if let Err(error) = &result {
    // A device that is gone cannot be told. For any other failure the device may still wait for
    // the user, so tell it to stop.
    if error.kind != ErrorKind::Communication {
      device.abandon();
    }
  }
  result
}

fn run<X: Transport>(
  device: &mut Device<'_, X>,
  state: PairingState,
  request: SignRequest<'_>,
  coin: &str,
) -> Result<SignOutcome, Error> {
  // The device cannot know the app yet, so it reports `Unpaired`. Any other answer would skip the
  // check that the user types the code that the device shows.
  if state != PairingState::Unpaired {
    return Err(unexpected_message());
  }
  device.pair()?;

  let features = device.features()?;
  check_features(&features)?;

  device.ui.progress(Progress::CheckingKey);
  // The device locks itself after a while, and then it asks for the PIN when it creates a session.
  if features.unlocked == Some(false) {
    device.ui.progress(Progress::Unlock);
  }
  // A device that always asks for the passphrase asks for it for the standard wallet too.
  let always_on_device = features.passphrase_always_on_device == Some(true);
  if always_on_device {
    device.ui.progress(Progress::Passphrase);
  }
  device.create_session(STANDARD_WALLET_SESSION, always_on_device)?;
  let (session, matched) = match device.match_key(STANDARD_WALLET_SESSION, &request, coin) {
    Ok(matched) => (STANDARD_WALLET_SESSION, matched),
    // The standard wallet holds none of the vault's keys. With the passphrase on, a wallet with
    // a passphrase may hold one.
    Err(error)
      if error.kind == ErrorKind::KeyNotInVault && features.passphrase_protection == Some(true) =>
    {
      device.ui.progress(Progress::Passphrase);
      device.create_session(PASSPHRASE_WALLET_SESSION, true)?;
      device.ui.progress(Progress::CheckingKey);
      let matched = device.match_key(PASSPHRASE_WALLET_SESSION, &request, coin)?;
      (PASSPHRASE_WALLET_SESSION, matched)
    }
    Err(error) => return Err(error),
  };
  let Matched { vault, fingerprint } = matched;

  let our_keys = precheck(&request.psbt, fingerprint, &vault)?;
  // Return before the device shows anything, so that the user confirms nothing for a transaction
  // that needs no signature from this device. `signed: false` is what the HWI path reports for
  // the same case.
  if already_signed(&request.psbt, &our_keys, &vault) {
    return Ok(SignOutcome {
      psbt: request.psbt,
      signed: false,
      fingerprint,
    });
  }

  let plan = prepare(
    &request.psbt,
    &vault,
    fingerprint,
    &our_keys,
    request.network,
    coin,
  )?;
  let signed = device.sign(session, &request.psbt, &plan)?;
  verify_signed(&request.psbt, &signed, &our_keys, &vault)?;

  Ok(SignOutcome {
    psbt: signed,
    signed: true,
    fingerprint,
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::proto::{SignTx, ThpEndRequest, ThpPairingRequest, Wire};
  use crate::test_device::{Behavior, SignMode, SoftDevice};
  use crate::test_support::{sign_with, Vault};
  use bitcoin::bip32::Xpriv;
  use bitcoin::{Network, NetworkKind};

  #[derive(Clone, Copy, PartialEq)]
  enum Code {
    /// The user types what the device shows.
    Right,
    /// The user types a code that the device does not show.
    Wrong,
    /// The user types the code with a space in the middle, as the device shows it.
    Spaced,
    /// The user cancels.
    Cancel,
  }

  struct TestUi {
    device: SoftDevice,
    code: Code,
    events: Vec<Progress>,
  }

  impl Ui for TestUi {
    fn progress(&mut self, progress: Progress) {
      self.events.push(progress);
    }

    fn pairing_code(&mut self) -> Option<String> {
      let shown = self.device.code().expect("the device shows a code");
      match self.code {
        Code::Right => Some(shown),
        Code::Spaced => Some(format!("{} {}", &shown[..3], &shown[3..])),
        Code::Wrong => {
          let first = if shown.starts_with('0') { '1' } else { '0' };
          Some(format!("{first}{}", &shown[1..]))
        }
        Code::Cancel => None,
      }
    }
  }

  fn master(seed: u8, kind: NetworkKind) -> Xpriv {
    Xpriv::new_master(kind, &[seed; 32]).expect("a master key")
  }

  /// A device whose standard wallet holds the key of the test vault.
  fn setup(behavior: Behavior, network: Network) -> (SoftDevice, Vault) {
    let vault = Vault::new(&behavior.standard_wallet, network);
    (SoftDevice::new(behavior), vault)
  }

  fn attempt(
    device: &SoftDevice,
    vault: &mut Vault,
    psbt: Option<Psbt>,
    code: Code,
  ) -> (Result<SignOutcome, Error>, Vec<Progress>) {
    let psbt = psbt.unwrap_or_else(|| vault.sweep_psbt());
    let mut ui = TestUi {
      device: device.clone(),
      code,
      events: Vec::new(),
    };
    let result = sign_psbt(
      device.clone(),
      SignRequest {
        network: vault.network,
        receive_descriptor: &vault.receive_descriptor,
        change_descriptor: Some(&vault.change_descriptor),
        psbt,
      },
      &mut ui,
    );
    (result, ui.events)
  }

  fn error_of(result: Result<SignOutcome, Error>) -> Error {
    match result {
      Ok(_) => panic!("the session succeeded"),
      Err(error) => error,
    }
  }

  /// Adds the signature of the second customer key and checks the transaction against the
  /// consensus rules.
  fn finalize(vault: &Vault, outcome: SignOutcome) {
    assert!(outcome.signed);
    let mut psbt = outcome.psbt;
    sign_with(&vault.keys.software_xprv, &mut psbt);
    let transaction = vault.finalize_and_verify(psbt);
    assert_eq!(transaction.input.len(), 3);
  }

  const NORMAL_RUN: [Progress; 5] = [
    Progress::Connecting,
    Progress::ConfirmConnection,
    Progress::EnterPairingCode,
    Progress::CheckingKey,
    Progress::Sign,
  ];

  #[test]
  fn a_normal_run_signs_and_reports_the_steps_in_order() {
    let (device, mut vault) = setup(Behavior::default(), Network::Testnet);
    let (result, events) = attempt(&device, &mut vault, None, Code::Right);
    let outcome = result.expect("the session signs");
    assert_eq!(events, NORMAL_RUN);
    assert_eq!(outcome.fingerprint, vault.device_fingerprint);
    finalize(&vault, outcome);
  }

  #[test]
  fn a_code_with_the_space_of_the_screen_pairs() {
    let (device, mut vault) = setup(Behavior::default(), Network::Testnet);
    let (result, _) = attempt(&device, &mut vault, None, Code::Spaced);
    finalize(&vault, result.expect("the session signs"));
  }

  #[test]
  fn the_device_key_signs_from_every_position_of_the_descriptor() {
    for slot in 0..3 {
      // With this seed the three orders that put the device key at a position are unsorted at
      // every address that the fixture funds.
      let behavior = Behavior {
        standard_wallet: master(0x32, NetworkKind::Test),
        ..Behavior::default()
      };
      let mut vault = Vault::with_device_at(&behavior.standard_wallet, Network::Testnet, slot);
      assert_eq!(
        vault.order[slot], 0,
        "the test builds the vault with the device at {slot}"
      );
      let device = SoftDevice::new(behavior);
      let (result, _) = attempt(&device, &mut vault, None, Code::Right);
      finalize(
        &vault,
        result.unwrap_or_else(|e| panic!("slot {slot}: {e}")),
      );
    }
  }

  #[test]
  fn a_mainnet_vault_signs() {
    let behavior = Behavior {
      standard_wallet: master(0x41, NetworkKind::Main),
      ..Behavior::default()
    };
    let (device, mut vault) = setup(behavior, Network::Bitcoin);
    let (result, _) = attempt(&device, &mut vault, None, Code::Right);
    finalize(&vault, result.expect("the session signs"));
  }

  #[test]
  fn a_regtest_and_a_signet_vault_sign() {
    // The wallet library of the fixture has no testnet4. The coin of testnet4 is a unit test.
    for network in [Network::Regtest, Network::Signet] {
      let (device, mut vault) = setup(Behavior::default(), network);
      let (result, _) = attempt(&device, &mut vault, None, Code::Right);
      finalize(&vault, result.unwrap_or_else(|e| panic!("{network}: {e}")));
    }
  }

  #[test]
  fn a_psbt_that_the_other_customer_key_signed_first_signs() {
    let (device, mut vault) = setup(Behavior::default(), Network::Testnet);
    let mut psbt = vault.sweep_psbt();
    sign_with(&vault.keys.software_xprv, &mut psbt);
    let (result, _) = attempt(&device, &mut vault, Some(psbt), Code::Right);
    let outcome = result.expect("the session signs");
    assert!(outcome
      .psbt
      .inputs
      .iter()
      .all(|input| input.partial_sigs.len() == 2));
    let transaction = vault.finalize_and_verify(outcome.psbt);
    assert_eq!(transaction.input.len(), 3);
  }

  #[test]
  fn a_payment_with_change_signs() {
    let (device, mut vault) = setup(Behavior::default(), Network::Testnet);
    let psbt = vault.spend_with_change_psbt(120_000);
    assert_eq!(psbt.outputs.len(), 2);
    let (result, _) = attempt(&device, &mut vault, Some(psbt), Code::Right);
    let outcome = result.expect("the session signs");
    let mut psbt = outcome.psbt;
    sign_with(&vault.keys.software_xprv, &mut psbt);
    vault.finalize_and_verify(psbt);
  }

  #[test]
  fn a_multipath_wallet_configuration_signs() {
    let (device, mut vault) = setup(Behavior::default(), Network::Testnet);
    let mut ui = TestUi {
      device: device.clone(),
      code: Code::Right,
      events: Vec::new(),
    };
    let psbt = vault.sweep_psbt();
    let outcome = sign_psbt(
      device.clone(),
      SignRequest {
        network: Network::Testnet,
        receive_descriptor: &vault.multipath_descriptor,
        change_descriptor: None,
        psbt,
      },
      &mut ui,
    )
    .expect("the session signs");
    finalize(&vault, outcome);
  }

  #[test]
  fn a_psbt_that_the_device_already_signed_is_returned_without_a_signing() {
    let (device, mut vault) = setup(Behavior::default(), Network::Testnet);
    let mut psbt = vault.sweep_psbt();
    sign_with(&vault.keys.device_xprv, &mut psbt);
    let before = psbt.clone();
    let (result, events) = attempt(&device, &mut vault, Some(psbt), Code::Right);
    let outcome = result.expect("the session ends well");
    assert!(!outcome.signed);
    assert_eq!(outcome.psbt, before);
    assert!(!events.contains(&Progress::Sign));
    assert!(!device
      .received()
      .iter()
      .any(|(_, kind)| *kind == SignTx::TYPE));
  }

  #[test]
  fn a_wrong_code_ends_the_session_and_asks_to_try_again() {
    let (device, mut vault) = setup(Behavior::default(), Network::Testnet);
    let (result, events) = attempt(&device, &mut vault, None, Code::Wrong);
    let error = error_of(result);
    assert_eq!(error.kind, ErrorKind::PairingRejected);
    assert!(error.message.contains("Start again"), "{}", error.message);
    assert!(!events.contains(&Progress::CheckingKey));
    // The device is told to stop waiting.
    assert!(device
      .received()
      .iter()
      .any(|(_, kind)| *kind == crate::proto::Cancel::TYPE));
  }

  #[test]
  fn a_code_that_is_not_six_digits_ends_the_session() {
    struct Short;
    impl Ui for Short {
      fn progress(&mut self, _: Progress) {}
      fn pairing_code(&mut self) -> Option<String> {
        Some("12345".to_string())
      }
    }
    let (device, mut vault) = setup(Behavior::default(), Network::Testnet);
    let error = error_of(sign_psbt(
      device,
      SignRequest {
        network: Network::Testnet,
        receive_descriptor: &vault.receive_descriptor.clone(),
        change_descriptor: None,
        psbt: vault.sweep_psbt(),
      },
      &mut Short,
    ));
    assert_eq!(error.kind, ErrorKind::PairingRejected);
    assert!(error.message.contains("6 digits"), "{}", error.message);
  }

  #[test]
  fn cancelling_in_the_app_ends_the_session_with_a_cancel_message() {
    let (device, mut vault) = setup(Behavior::default(), Network::Testnet);
    let (result, _) = attempt(&device, &mut vault, None, Code::Cancel);
    let error = error_of(result);
    assert_eq!(error.kind, ErrorKind::UserAbort);
    assert!(error.message.contains("cancelled"), "{}", error.message);
    assert!(device
      .received()
      .iter()
      .any(|(_, kind)| *kind == crate::proto::Cancel::TYPE));
  }

  #[test]
  fn a_connection_that_the_user_refuses_on_the_device_is_a_rejected_pairing() {
    let (device, mut vault) = setup(
      Behavior {
        refuse_pairing: true,
        ..Behavior::default()
      },
      Network::Testnet,
    );
    let (result, events) = attempt(&device, &mut vault, None, Code::Right);
    let error = error_of(result);
    assert_eq!(error.kind, ErrorKind::PairingRejected);
    assert_eq!(events, [Progress::Connecting, Progress::ConfirmConnection]);
  }

  #[test]
  fn cancelling_on_the_code_screen_of_the_device_is_a_rejected_pairing() {
    let (device, mut vault) = setup(
      Behavior {
        cancel_at_code: true,
        ..Behavior::default()
      },
      Network::Testnet,
    );
    let (result, _) = attempt(&device, &mut vault, None, Code::Right);
    let error = error_of(result);
    assert_eq!(error.kind, ErrorKind::PairingRejected);
    assert!(error.message.contains("cancelled"), "{}", error.message);
  }

  #[test]
  fn stale_packets_at_the_start_do_not_disturb_a_session() {
    let (mut device, mut vault) = setup(Behavior::default(), Network::Testnet);
    device.queue_stale_packets();
    let (result, events) = attempt(&device, &mut vault, None, Code::Right);
    finalize(&vault, result.expect("the session signs"));
    assert_eq!(events, NORMAL_RUN);
  }

  #[test]
  fn the_pairing_request_names_the_app() {
    // The device shows these names, and the user decides on them.
    use crate::pairing::{APP_NAME, HOST_NAME};
    assert_eq!(HOST_NAME, "Swan Vault Recovery Assistant");
    assert!(!APP_NAME.is_empty());
    let request = ThpPairingRequest {
      host_name: HOST_NAME.to_string(),
      app_name: APP_NAME.to_string(),
    };
    assert_eq!(ThpPairingRequest::TYPE, 1008);
    assert!(!prost::Message::encode_to_vec(&request).is_empty());
    assert_eq!(ThpEndRequest::TYPE, 1018);
  }

  #[test]
  fn a_device_that_returns_a_signature_of_another_key_is_caught() {
    let (device, mut vault) = setup(
      Behavior {
        sign_mode: SignMode::WrongKey,
        ..Behavior::default()
      },
      Network::Testnet,
    );
    let (result, _) = attempt(&device, &mut vault, None, Code::Right);
    let error = error_of(result);
    assert_eq!(error.kind, ErrorKind::InvalidSignature);
  }

  #[test]
  fn a_device_that_changes_nothing_is_caught() {
    let (device, mut vault) = setup(
      Behavior {
        sign_mode: SignMode::NoSignatures,
        ..Behavior::default()
      },
      Network::Testnet,
    );
    let (result, _) = attempt(&device, &mut vault, None, Code::Right);
    let error = error_of(result);
    assert_eq!(error.kind, ErrorKind::InvalidSignature);
    assert!(
      error.message.contains("without a signature"),
      "{}",
      error.message
    );
  }

  #[test]
  fn cancelling_the_transaction_on_the_device_is_a_user_abort() {
    let (device, mut vault) = setup(
      Behavior {
        sign_mode: SignMode::Cancel,
        ..Behavior::default()
      },
      Network::Testnet,
    );
    let (result, events) = attempt(&device, &mut vault, None, Code::Right);
    let error = error_of(result);
    assert_eq!(error.kind, ErrorKind::UserAbort);
    assert!(
      error.message.contains("Nothing was signed"),
      "{}",
      error.message
    );
    assert_eq!(events.last(), Some(&Progress::Sign));
  }

  #[test]
  fn a_device_that_never_stops_asking_ends_the_session() {
    let (device, mut vault) = setup(
      Behavior {
        sign_mode: SignMode::Endless,
        ..Behavior::default()
      },
      Network::Testnet,
    );
    let (result, _) = attempt(&device, &mut vault, None, Code::Right);
    let error = error_of(result);
    assert_eq!(error.kind, ErrorKind::Communication);
    assert!(error.message.contains("more data"), "{}", error.message);
  }

  #[test]
  fn the_passphrase_wallet_is_opened_when_the_standard_wallet_lacks_the_key() {
    let behavior = Behavior {
      passphrase_protection: true,
      ..Behavior::default()
    };
    let mut vault = Vault::new(&behavior.passphrase_wallet, Network::Testnet);
    let device = SoftDevice::new(behavior);
    let (result, events) = attempt(&device, &mut vault, None, Code::Right);
    let outcome = result.expect("the session signs");
    assert_eq!(
      events,
      [
        Progress::Connecting,
        Progress::ConfirmConnection,
        Progress::EnterPairingCode,
        Progress::CheckingKey,
        Progress::Passphrase,
        Progress::CheckingKey,
        Progress::Sign,
      ]
    );
    finalize(&vault, outcome);
  }

  #[test]
  fn a_device_without_passphrase_protection_is_not_asked_for_a_passphrase() {
    let behavior = Behavior::default();
    let mut vault = Vault::new(&behavior.passphrase_wallet, Network::Testnet);
    let device = SoftDevice::new(behavior);
    let (result, events) = attempt(&device, &mut vault, None, Code::Right);
    let error = error_of(result);
    assert_eq!(error.kind, ErrorKind::KeyNotInVault);
    assert!(!events.contains(&Progress::Passphrase));
  }

  #[test]
  fn a_device_with_no_wallet_that_holds_the_key_is_refused_even_with_a_passphrase() {
    let behavior = Behavior {
      passphrase_protection: true,
      ..Behavior::default()
    };
    let mut vault = Vault::new(&master(0x77, NetworkKind::Test), Network::Testnet);
    let device = SoftDevice::new(behavior);
    let (result, events) = attempt(&device, &mut vault, None, Code::Right);
    let error = error_of(result);
    assert_eq!(error.kind, ErrorKind::KeyNotInVault);
    assert!(events.contains(&Progress::Passphrase));
  }

  #[test]
  fn cancelling_the_passphrase_is_a_user_abort() {
    let behavior = Behavior {
      passphrase_protection: true,
      cancel_passphrase: true,
      ..Behavior::default()
    };
    let mut vault = Vault::new(&behavior.passphrase_wallet, Network::Testnet);
    let device = SoftDevice::new(behavior);
    let (result, _) = attempt(&device, &mut vault, None, Code::Right);
    assert_eq!(error_of(result).kind, ErrorKind::UserAbort);
  }

  #[test]
  fn a_device_that_always_asks_for_the_passphrase_asks_at_the_standard_wallet() {
    let behavior = Behavior {
      passphrase_protection: true,
      passphrase_always_on_device: true,
      ..Behavior::default()
    };
    // The wallet that the user opens by typing on the device holds the vault key.
    let mut vault = Vault::new(&behavior.passphrase_wallet, Network::Testnet);
    let device = SoftDevice::new(behavior);
    let (result, events) = attempt(&device, &mut vault, None, Code::Right);
    let outcome = result.expect("the session signs");
    assert_eq!(
      events,
      [
        Progress::Connecting,
        Progress::ConfirmConnection,
        Progress::EnterPairingCode,
        Progress::CheckingKey,
        Progress::Passphrase,
        Progress::Sign,
      ]
    );
    finalize(&vault, outcome);
  }

  #[test]
  fn a_device_that_does_not_hold_a_key_of_the_vault_is_refused() {
    let mut vault = Vault::new(&master(0x55, NetworkKind::Test), Network::Testnet);
    let device = SoftDevice::new(Behavior::default());
    let (result, _) = attempt(&device, &mut vault, None, Code::Right);
    let error = error_of(result);
    assert_eq!(error.kind, ErrorKind::KeyNotInVault);
    assert!(error.message.contains("Trezor Safe 7"), "{}", error.message);
  }

  #[test]
  fn a_device_with_no_wallet_is_refused_after_the_pairing() {
    let (device, mut vault) = setup(
      Behavior {
        initialized: false,
        ..Behavior::default()
      },
      Network::Testnet,
    );
    let (result, _) = attempt(&device, &mut vault, None, Code::Right);
    assert_eq!(error_of(result).kind, ErrorKind::NotInitialized);
  }

  #[test]
  fn old_firmware_is_refused() {
    let (device, mut vault) = setup(
      Behavior {
        minor_version: 9,
        patch_version: 2,
        ..Behavior::default()
      },
      Network::Testnet,
    );
    let (result, _) = attempt(&device, &mut vault, None, Code::Right);
    let error = error_of(result);
    assert_eq!(error.kind, ErrorKind::FirmwareTooOld);
    assert!(error.message.contains("2.9.2"), "{}", error.message);
  }

  #[test]
  fn another_model_is_refused_before_the_pairing() {
    let (device, mut vault) = setup(
      Behavior {
        model: "T3T1".to_string(),
        ..Behavior::default()
      },
      Network::Testnet,
    );
    let (result, events) = attempt(&device, &mut vault, None, Code::Right);
    assert_eq!(error_of(result).kind, ErrorKind::Other);
    assert_eq!(events, [Progress::Connecting]);
    assert!(device.received().is_empty());
  }

  #[test]
  fn a_device_that_reports_the_bootloader_is_refused() {
    let (device, mut vault) = setup(
      Behavior {
        bootloader_mode: true,
        ..Behavior::default()
      },
      Network::Testnet,
    );
    let (result, _) = attempt(&device, &mut vault, None, Code::Right);
    assert_eq!(error_of(result).kind, ErrorKind::Bootloader);
  }

  #[test]
  fn a_locked_device_shows_its_pin_screen_and_the_session_goes_on() {
    let (device, mut vault) = setup(
      Behavior {
        locked: true,
        ..Behavior::default()
      },
      Network::Testnet,
    );
    let (result, events) = attempt(&device, &mut vault, None, Code::Right);
    let outcome = result.expect("the session signs");
    assert_eq!(
      events,
      [
        Progress::Connecting,
        Progress::Unlock,
        Progress::ConfirmConnection,
        Progress::EnterPairingCode,
        Progress::CheckingKey,
        Progress::Sign,
      ]
    );
    finalize(&vault, outcome);
  }

  #[test]
  fn a_locked_device_that_the_user_does_not_unlock_ends_the_session() {
    let (device, mut vault) = setup(
      Behavior {
        locked: true,
        unlock_fails: true,
        ..Behavior::default()
      },
      Network::Testnet,
    );
    let (result, _) = attempt(&device, &mut vault, None, Code::Right);
    let error = error_of(result);
    assert_eq!(error.kind, ErrorKind::UserAbort);
    assert!(error.message.contains("PIN"), "{}", error.message);
  }

  #[test]
  fn a_device_that_locked_itself_asks_for_the_pin_at_the_session() {
    let (device, mut vault) = setup(
      Behavior {
        features_locked: true,
        ..Behavior::default()
      },
      Network::Testnet,
    );
    let (result, events) = attempt(&device, &mut vault, None, Code::Right);
    finalize(&vault, result.expect("the session signs"));
    let checking = events
      .iter()
      .position(|e| *e == Progress::CheckingKey)
      .expect("checking");
    assert_eq!(events[checking + 1], Progress::Unlock);
  }

  #[test]
  fn a_device_that_claims_to_know_the_app_is_refused() {
    let (device, mut vault) = setup(
      Behavior {
        claim_paired: true,
        ..Behavior::default()
      },
      Network::Testnet,
    );
    let (result, _) = attempt(&device, &mut vault, None, Code::Right);
    assert_eq!(error_of(result).kind, ErrorKind::Communication);
  }

  #[test]
  fn a_device_that_is_unplugged_in_the_middle_ends_the_session() {
    let (device, mut vault) = setup(
      Behavior {
        disconnect_after: Some(30),
        ..Behavior::default()
      },
      Network::Testnet,
    );
    let (result, _) = attempt(&device, &mut vault, None, Code::Right);
    let error = error_of(result);
    assert_eq!(error.kind, ErrorKind::Communication);
    assert!(error.message.contains("unplugged"), "{}", error.message);
  }

  #[test]
  fn a_silent_device_ends_the_session_with_a_timeout() {
    let (device, mut vault) = setup(
      Behavior {
        silent: true,
        ..Behavior::default()
      },
      Network::Testnet,
    );
    let (result, _) = attempt(&device, &mut vault, None, Code::Right);
    let error = error_of(result);
    assert_eq!(error.kind, ErrorKind::Communication);
    assert!(
      error.message.contains("did not answer"),
      "{}",
      error.message
    );
  }

  #[test]
  fn a_descriptor_that_the_app_cannot_use_fails_before_the_device_is_touched() {
    let (device, mut vault) = setup(Behavior::default(), Network::Testnet);
    let mut ui = TestUi {
      device: device.clone(),
      code: Code::Right,
      events: Vec::new(),
    };
    let error = error_of(sign_psbt(
      device.clone(),
      SignRequest {
        network: Network::Testnet,
        receive_descriptor: "wpkh(tpubD6NzVbkrYhZ4X3vCdevm3aFUdeSAWsbR4UhhdApbXnVUnvuwtq5NYqQ7zCkNhYG4JcPdGW4Wg4ZrVSYGpdoWsn337qmkP6CFgs7pZid12Sa/0/*)",
        change_descriptor: None,
        psbt: vault.sweep_psbt(),
      },
      &mut ui,
    ));
    assert_eq!(error.kind, ErrorKind::UnsupportedDescriptor);
    assert!(ui.events.is_empty());
    assert!(device.sent_packets().is_empty());
  }

  #[test]
  fn the_secret_of_the_pairing_never_reaches_the_user_in_an_error() {
    let (device, mut vault) = setup(Behavior::default(), Network::Testnet);
    let (result, _) = attempt(&device, &mut vault, None, Code::Wrong);
    let shown = device.code().expect("a code");
    let error = error_of(result);
    assert!(!error.message.contains(&shown), "{}", error.message);
  }
}
