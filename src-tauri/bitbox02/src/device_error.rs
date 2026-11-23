//! The one place where errors of the `bitbox-api` crate become errors the user can read.

use crate::error::{Error, ErrorKind};
use crate::session::POLICY_NAME;
use bitbox_api::btc::PsbtError;
use bitbox_api::error::{BitBoxError, Error as DeviceError};
use bitbox_api::pb::BtcCoin;

/// The step of the session that failed. The same device error means different things in
/// different steps.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Step {
  /// Opening the device and its first query.
  Connect,
  /// The unlock request, which waits for the password, and the pairing handshake that follows.
  Unlock,
  /// Confirming the pairing code.
  Pair,
  /// Reading the device info and the fingerprint.
  Query,
  /// Asking whether the vault is registered.
  Registration(BtcCoin),
  /// Registering the vault.
  Register(BtcCoin),
  /// Signing the PSBT.
  Sign(BtcCoin),
}

const RESTART_ADVICE: &str = "Unplug the BitBox02, plug it in again, and try again.";

/// A reset erases every registered wallet. The BitBox02 has no command that removes one.
const RESET_ADVICE: &str = "The BitBox02 cannot remove a single registered wallet. A reset removes all of them. Reset it only if you have its recovery words.";

fn error(kind: ErrorKind, message: impl Into<String>) -> Error {
  Error::new(kind, message)
}

fn lost_contact() -> Error {
  error(
    ErrorKind::Communication,
    format!(
      "SVRA lost contact with the BitBox02. If the BitBoxApp is open, close it. {RESTART_ADVICE}"
    ),
  )
}

fn communication_error(step: Step) -> Error {
  match step {
    Step::Connect | Step::Unlock => error(
      ErrorKind::Communication,
      format!(
        "SVRA cannot talk to the BitBox02. Close the BitBoxApp, because only one program can use the BitBox02. {RESTART_ADVICE}"
      ),
    ),
    _ => lost_contact(),
  }
}

fn invalid_input(step: Step) -> Error {
  match step {
    Step::Registration(_) | Step::Register(_) => error(
      ErrorKind::UnsupportedDescriptor,
      "The BitBox02 refused to register the vault. It checks that its own key matches the descriptor. Check that the descriptors belong to the vault of this BitBox02.",
    ),
    Step::Sign(_) => error(
      ErrorKind::InvalidPsbt,
      "The BitBox02 refused the transaction. Check that the transaction and the descriptors come from the same vault, and that the PSBT holds the full previous transactions.",
    ),
    Step::Connect | Step::Unlock | Step::Pair | Step::Query => error(
      ErrorKind::Other,
      format!("The BitBox02 refused a request. {RESTART_ADVICE}"),
    ),
  }
}

fn psbt_error(psbt_error: &PsbtError) -> Error {
  let message = match psbt_error {
    PsbtError::SignError(reason) => format!("The PSBT is incomplete or damaged: {reason}."),
    PsbtError::KeyNotUnique => {
      "A key appears more than once in an input, so the BitBox02 cannot sign it.".to_string()
    }
    PsbtError::KeyNotFound => {
      "An input of the PSBT has no key of this BitBox02. Check that the BitBox02 holds a key of this vault.".to_string()
    }
    PsbtError::UnknownOutputType => {
      "The transaction pays to a script type that the BitBox02 cannot show, so it cannot sign the transaction.".to_string()
    }
    PsbtError::InvalidOpReturn(reason) => {
      format!("The transaction has an OP_RETURN output that the BitBox02 does not accept: {reason}.")
    }
  };
  error(ErrorKind::InvalidPsbt, message)
}

/// Turns an error of the device library into an error for the user.
pub(crate) fn map_device_error(device_error: DeviceError, step: Step) -> Error {
  match device_error {
    DeviceError::BitBox(BitBoxError::UserAbort) => error(
      ErrorKind::UserAbort,
      "You cancelled on the BitBox02. Nothing was signed. Start again when you are ready.",
    ),
    DeviceError::NoisePairingRejected => error(
      ErrorKind::PairingRejected,
      "The pairing was rejected. Start again. Compare the code on this screen with the code on the BitBox02, and confirm only if they match.",
    ),
    DeviceError::Version(required) => error(
      ErrorKind::FirmwareTooOld,
      format!(
        "The BitBox02 firmware is too old for this step. It needs version {}. Update the firmware in the BitBoxApp, then try again.",
        required.trim_start_matches(">=")
      ),
    ),
    DeviceError::BitBox(BitBoxError::Duplicate) if matches!(step, Step::Register(_)) => error(
      ErrorKind::PolicyNameTaken,
      format!(
        "This BitBox02 already holds a different wallet under each name that SVRA can use for this vault: {POLICY_NAME} and {POLICY_NAME}_ with 8 more characters. A BitBox02 keeps one wallet for each name. Use the BitBox02 that belongs to this vault. {RESET_ADVICE}"
      ),
    ),
    DeviceError::BitBox(BitBoxError::Generic) if matches!(step, Step::Register(_)) => error(
      ErrorKind::Other,
      format!(
        "The BitBox02 could not store the vault. Its list of registered wallets may be full, because it holds 25. {RESET_ADVICE}"
      ),
    ),
    // The library turns every failure of the unlock request into this error. The request waits
    // for the password, and the device cannot cancel that wait, so unplugging is the normal way
    // out and this error means that the device went away.
    DeviceError::Unknown if matches!(step, Step::Unlock) => lost_contact(),
    DeviceError::BitBox(BitBoxError::InvalidInput) => invalid_input(step),
    DeviceError::BitBox(BitBoxError::Memory) => error(
      ErrorKind::Other,
      format!("The BitBox02 could not write to its memory. {RESTART_ADVICE}"),
    ),
    DeviceError::BitBox(BitBoxError::InvalidState) => error(
      ErrorKind::Other,
      format!("The BitBox02 is not ready for this step. {RESTART_ADVICE} Unlock it when asked."),
    ),
    DeviceError::BitBox(BitBoxError::Disabled) => error(
      ErrorKind::Other,
      "This BitBox02 does not support this action.",
    ),
    DeviceError::BitBox(BitBoxError::NoiseEncrypt | BitBoxError::NoiseDecrypt)
    | DeviceError::Noise
    | DeviceError::NoiseConfig(_)
    | DeviceError::UnexpectedResponse
    | DeviceError::ProtobufDecode
    | DeviceError::Communication(_) => communication_error(step),
    DeviceError::Psbt(reason) => psbt_error(&reason),
    DeviceError::InvalidSignature => error(
      ErrorKind::InvalidSignature,
      "The BitBox02 returned a signature in a format that SVRA cannot read. Do not use the result.",
    ),
    DeviceError::AntiKlepto(_) => error(
      ErrorKind::InvalidSignature,
      "The BitBox02 failed the check that its signature is honest. Do not use the result, and use another BitBox02 if this repeats.",
    ),
    DeviceError::BtcSign(reason) => error(
      ErrorKind::InvalidPsbt,
      format!("The BitBox02 library cannot sign this PSBT: {reason}."),
    ),
    DeviceError::BitBox(
      BitBoxError::Unknown | BitBoxError::Duplicate | BitBoxError::Generic,
    )
    | DeviceError::Unknown
    | DeviceError::KeypathParse(_)
    | DeviceError::EthTypedMessage(_) => error(
      ErrorKind::Other,
      format!("The BitBox02 returned an error that SVRA does not know. {RESTART_ADVICE}"),
    ),
    // The USB and simulator transports add variants when their features are on.
    #[allow(unreachable_patterns)]
    _ => communication_error(step),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use bitbox_api::CommunicationError;

  fn map(device_error: DeviceError, step: Step) -> Error {
    map_device_error(device_error, step)
  }

  #[test]
  fn user_abort_is_a_user_abort_in_every_step() {
    for step in [
      Step::Connect,
      Step::Register(BtcCoin::Tbtc),
      Step::Sign(BtcCoin::Btc),
    ] {
      let mapped = map(DeviceError::BitBox(BitBoxError::UserAbort), step);
      assert_eq!(mapped.kind, ErrorKind::UserAbort);
    }
  }

  #[test]
  fn a_rejected_pairing_code_is_a_pairing_rejection() {
    let mapped = map(DeviceError::NoisePairingRejected, Step::Pair);
    assert_eq!(mapped.kind, ErrorKind::PairingRejected);
  }

  #[test]
  fn an_old_firmware_names_the_version_it_needs() {
    let mapped = map(DeviceError::Version(">=9.15.0"), Step::Sign(BtcCoin::Btc));
    assert_eq!(mapped.kind, ErrorKind::FirmwareTooOld);
    assert!(mapped.message.contains("9.15.0"), "{}", mapped.message);
  }

  #[test]
  fn a_duplicate_name_while_registering_means_the_names_are_taken() {
    let mapped = map(
      DeviceError::BitBox(BitBoxError::Duplicate),
      Step::Register(BtcCoin::Tbtc),
    );
    assert_eq!(mapped.kind, ErrorKind::PolicyNameTaken);
    assert!(mapped.message.contains(POLICY_NAME));
    assert!(mapped.message.contains("each name"), "{}", mapped.message);
    assert!(mapped.message.contains("reset"));
  }

  #[test]
  fn a_duplicate_outside_registration_is_not_a_taken_name() {
    let mapped = map(
      DeviceError::BitBox(BitBoxError::Duplicate),
      Step::Sign(BtcCoin::Tbtc),
    );
    assert_eq!(mapped.kind, ErrorKind::Other);
  }

  #[test]
  fn a_full_registration_table_is_explained() {
    let mapped = map(
      DeviceError::BitBox(BitBoxError::Generic),
      Step::Register(BtcCoin::Btc),
    );
    assert_eq!(mapped.kind, ErrorKind::Other);
    assert!(mapped.message.contains("25"), "{}", mapped.message);
  }

  #[test]
  fn invalid_input_depends_on_the_step() {
    let invalid = || DeviceError::BitBox(BitBoxError::InvalidInput);
    assert_eq!(
      map(invalid(), Step::Registration(BtcCoin::Tbtc)).kind,
      ErrorKind::UnsupportedDescriptor
    );
    assert_eq!(
      map(invalid(), Step::Register(BtcCoin::Btc)).kind,
      ErrorKind::UnsupportedDescriptor
    );
    assert_eq!(
      map(invalid(), Step::Sign(BtcCoin::Btc)).kind,
      ErrorKind::InvalidPsbt
    );
  }

  #[test]
  fn channel_failures_are_communication_errors() {
    for device_error in [
      DeviceError::Noise,
      DeviceError::UnexpectedResponse,
      DeviceError::ProtobufDecode,
      DeviceError::BitBox(BitBoxError::NoiseDecrypt),
      DeviceError::Communication(CommunicationError::Read),
    ] {
      let mapped = map(device_error, Step::Sign(BtcCoin::Btc));
      assert_eq!(mapped.kind, ErrorKind::Communication);
    }
  }

  #[test]
  fn a_connection_failure_asks_to_close_the_bitbox_app() {
    let mapped = map(
      DeviceError::Communication(CommunicationError::Info),
      Step::Connect,
    );
    assert_eq!(mapped.kind, ErrorKind::Communication);
    assert!(mapped.message.contains("BitBoxApp"), "{}", mapped.message);
  }

  #[test]
  fn psbt_errors_are_invalid_psbt_errors() {
    let mapped = map(
      DeviceError::Psbt(PsbtError::KeyNotFound),
      Step::Sign(BtcCoin::Btc),
    );
    assert_eq!(mapped.kind, ErrorKind::InvalidPsbt);
    let mapped = map(
      DeviceError::BtcSign("input's previous transaction required but missing".into()),
      Step::Sign(BtcCoin::Btc),
    );
    assert_eq!(mapped.kind, ErrorKind::InvalidPsbt);
  }

  #[test]
  fn signature_problems_are_invalid_signature_errors() {
    let mapped = map(DeviceError::InvalidSignature, Step::Sign(BtcCoin::Btc));
    assert_eq!(mapped.kind, ErrorKind::InvalidSignature);
  }

  #[test]
  fn an_unknown_error_while_connecting_is_a_lost_connection() {
    // The device library returns it when the unlock request fails, for example when the user
    // unplugs the device.
    let mapped = map(DeviceError::Unknown, Step::Unlock);
    assert_eq!(mapped.kind, ErrorKind::Communication);
    assert!(
      mapped
        .message
        .starts_with("SVRA lost contact with the BitBox02."),
      "{}",
      mapped.message
    );
  }

  #[test]
  fn an_unknown_error_outside_the_unlock_step_is_not_a_lost_connection() {
    let mapped = map(DeviceError::Unknown, Step::Connect);
    assert_eq!(mapped.kind, ErrorKind::Other);
  }

  #[test]
  fn a_failed_pairing_handshake_asks_to_close_the_bitbox_app() {
    let mapped = map(DeviceError::Noise, Step::Unlock);
    assert_eq!(mapped.kind, ErrorKind::Communication);
    assert!(mapped.message.contains("BitBoxApp"), "{}", mapped.message);
  }

  #[test]
  fn a_lost_connection_asks_to_close_the_bitbox_app_and_to_unplug() {
    let mapped = map(DeviceError::Noise, Step::Sign(BtcCoin::Btc));
    assert_eq!(mapped.kind, ErrorKind::Communication);
    assert!(
      mapped
        .message
        .contains("If the BitBoxApp is open, close it."),
      "{}",
      mapped.message
    );
    assert!(mapped.message.contains("Unplug"), "{}", mapped.message);
  }

  #[test]
  fn an_unknown_error_is_other() {
    let mapped = map(DeviceError::Unknown, Step::Sign(BtcCoin::Btc));
    assert_eq!(mapped.kind, ErrorKind::Other);
    let mapped = map(
      DeviceError::BitBox(BitBoxError::Unknown),
      Step::Sign(BtcCoin::Btc),
    );
    assert_eq!(mapped.kind, ErrorKind::Other);
  }
}
