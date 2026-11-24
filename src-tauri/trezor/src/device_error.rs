//! The one place where the failures of the link and the device become errors that the user can
//! read.

use crate::error::{Error, ErrorKind};
use crate::link::LinkError;
use crate::proto::{Failure, FailureType};
use crate::transport::TransportError;

/// The step of the session that failed. The same failure means different things in different
/// steps.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Step {
  /// The pairing, up to the point where the user types the code.
  Pair,
  /// The pairing, after the code went to the device.
  PairCode,
  /// Reading the device's features and keys, and creating a wallet session.
  Query,
  /// Waiting for the user to enter the passphrase on the device.
  Passphrase,
  /// Signing the transaction.
  Sign,
}

const RESTART_ADVICE: &str = "Unplug the Trezor Safe 7, plug it in again, and try again.";
const SUITE_ADVICE: &str = "If Trezor Suite is open, close it.";

fn error(kind: ErrorKind, message: impl Into<String>) -> Error {
  Error::new(kind, message)
}

/// The error for an unexpected message: a type that the step does not allow.
pub(crate) fn unexpected_message() -> Error {
  error(
    ErrorKind::Communication,
    format!(
      "The Trezor Safe 7 sent an answer that SVRA does not understand. {SUITE_ADVICE} {RESTART_ADVICE}"
    ),
  )
}

/// The error for a lost or broken connection to the device.
pub(crate) fn link_error(link_error: LinkError) -> Error {
  match link_error {
    LinkError::Transport(TransportError::Disconnected) => error(
      ErrorKind::Communication,
      format!(
        "The Trezor Safe 7 was unplugged or stopped answering. Nothing was signed. Plug it in again and try again. {SUITE_ADVICE}"
      ),
    ),
    LinkError::Transport(TransportError::Failed) => error(
      ErrorKind::Communication,
      format!(
        "SVRA cannot talk to the Trezor Safe 7. Close Trezor Suite, because only one program can use the Trezor Safe 7. {RESTART_ADVICE}"
      ),
    ),
    LinkError::UserTimeout => error(
      ErrorKind::Communication,
      "SVRA waited ten minutes for you on the Trezor Safe 7. Nothing was signed. Start again when you are ready.",
    ),
    LinkError::Timeout => error(
      ErrorKind::Communication,
      format!(
        "The Trezor Safe 7 stopped answering. Nothing was signed. Unplug the Trezor Safe 7, plug it in again, and start again. {SUITE_ADVICE}"
      ),
    ),
    LinkError::DeviceLocked => error(
      ErrorKind::UserAbort,
      "The Trezor Safe 7 is locked. Unlock it with your PIN when it asks, then try again.",
    ),
    LinkError::ChannelLost => error(
      ErrorKind::Communication,
      format!(
        "SVRA lost contact with the Trezor Safe 7. {SUITE_ADVICE} {RESTART_ADVICE}"
      ),
    ),
    LinkError::Protocol => unexpected_message(),
  }
}

/// The error for a `Failure` message of the device. The text of the device is not shown: SVRA
/// has its own sentence for each failure that it knows, and for the others it shows the code.
pub(crate) fn failure_error(failure: &Failure, step: Step) -> Error {
  let code = failure
    .code
    .and_then(|code| FailureType::try_from(code).ok());
  match (code, step) {
    (Some(FailureType::ActionCancelled), Step::Pair | Step::PairCode) => error(
      ErrorKind::PairingRejected,
      "The Trezor Safe 7 stopped the pairing. Either you cancelled on it, or it locked itself after some minutes without a touch. Start again, and allow the connection when the Trezor Safe 7 asks.",
    ),
    (Some(FailureType::ActionCancelled), _) => error(
      ErrorKind::UserAbort,
      "The Trezor Safe 7 stopped the signing. Either you cancelled on it, or it locked itself after some minutes without a touch. Nothing was signed, so start again when you are ready.",
    ),
    // The device rejects a tag that does not fit the code with a data error. Any other failure
    // at this step has its own message below.
    (Some(FailureType::DataError), Step::PairCode) => error(
      ErrorKind::PairingRejected,
      "The pairing code was wrong. Start again, and type the code that the Trezor Safe 7 shows.",
    ),
    (Some(FailureType::PinCancelled), _) => error(
      ErrorKind::UserAbort,
      "You cancelled the PIN entry on the Trezor Safe 7. Nothing was signed. Start again when you are ready.",
    ),
    (Some(FailureType::PinInvalid | FailureType::PinMismatch | FailureType::PinExpected), _) => {
      error(
        ErrorKind::UserAbort,
        "The Trezor Safe 7 did not accept the PIN. Nothing was signed. Start again and enter the PIN on the Trezor Safe 7.",
      )
    }
    (Some(FailureType::NotInitialized), _) => error(
      ErrorKind::NotInitialized,
      "This Trezor Safe 7 has no wallet yet. Set it up or restore it in Trezor Suite first, then try again.",
    ),
    (Some(FailureType::Busy | FailureType::InProgress), _) => error(
      ErrorKind::Communication,
      format!(
        "The Trezor Safe 7 is busy with another task. Finish or cancel it on the Trezor Safe 7, then try again. {SUITE_ADVICE}"
      ),
    ),
    (
      Some(
        FailureType::ThpUnallocatedSession | FailureType::InvalidSession | FailureType::InvalidProtocol,
      ),
      _,
    ) => error(
      ErrorKind::Communication,
      format!(
        "SVRA lost contact with the Trezor Safe 7. {SUITE_ADVICE} {RESTART_ADVICE}"
      ),
    ),
    // The text of the device only decides which message to show. It is never shown. A key path
    // that the device refuses comes at the key query for an unusual account path, and at the
    // signing for a coin that does not fit the path.
    (Some(FailureType::DataError), Step::Query | Step::Sign)
      if failure
        .message
        .as_deref()
        .is_some_and(|text| text.contains("Forbidden key path")) =>
    {
      error(
        ErrorKind::ForbiddenKeyPath,
        "The Trezor Safe 7 refuses the key path of this wallet configuration. Check that the wallet configuration is the one from your Swan Vault Recovery Sheet. Check also that the network that you selected in SVRA is the network of your vault.",
      )
    }
    (Some(FailureType::NotEnoughFunds), Step::Sign) => error(
      ErrorKind::InvalidPsbt,
      "The Trezor Safe 7 says that the inputs do not cover the outputs and the fee. Create the transaction again with SVRA.",
    ),
    (Some(FailureType::InvalidSignature), Step::Sign) => error(
      ErrorKind::InvalidSignature,
      "The Trezor Safe 7 reports a signature that does not verify. Do not use the result. Contact Swan support.",
    ),
    (
      Some(
        FailureType::DataError
        | FailureType::ProcessError
        | FailureType::FirmwareError
        | FailureType::UnexpectedMessage
        | FailureType::ButtonExpected,
      ),
      Step::Sign,
    ) => error(
      ErrorKind::InvalidPsbt,
      "The Trezor Safe 7 refused the transaction. Check that the transaction and the wallet configuration are from the same vault. If they are, create the transaction again with SVRA.",
    ),
    (Some(FailureType::FirmwareError), _) => error(
      ErrorKind::Other,
      format!(
        "The firmware of the Trezor Safe 7 reported an internal error. {RESTART_ADVICE} If it happens again, contact Swan support."
      ),
    ),
    (
      Some(
        FailureType::DataError
        | FailureType::ProcessError
        | FailureType::UnexpectedMessage
        | FailureType::ButtonExpected,
      ),
      _,
    ) => error(
      ErrorKind::Other,
      format!(
        "The Trezor Safe 7 could not carry out a request of SVRA. {RESTART_ADVICE} If it happens again, contact Swan support."
      ),
    ),
    _ => {
      let number = failure
        .code
        .map_or_else(|| "none".to_string(), |code| code.to_string());
      error(
        ErrorKind::Other,
        format!(
          "The Trezor Safe 7 returned an error that SVRA does not know (code {number}). {RESTART_ADVICE}"
        ),
      )
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn failure(code: FailureType, message: Option<&str>) -> Failure {
    Failure {
      code: Some(code as i32),
      message: message.map(str::to_string),
    }
  }

  #[test]
  fn a_stop_by_the_device_while_signing_names_both_causes() {
    let mapped = failure_error(&failure(FailureType::ActionCancelled, None), Step::Sign);
    assert_eq!(mapped.kind, ErrorKind::UserAbort);
    for phrase in [
      "cancelled on it",
      "locked itself",
      "Nothing was signed",
      "start again",
    ] {
      assert!(mapped.message.contains(phrase), "{}", mapped.message);
    }
  }

  #[test]
  fn a_stop_by_the_device_at_the_connection_dialog_is_a_refused_pairing() {
    let mapped = failure_error(&failure(FailureType::ActionCancelled, None), Step::Pair);
    assert_eq!(mapped.kind, ErrorKind::PairingRejected);
    assert!(mapped.message.contains("Start again"), "{}", mapped.message);
  }

  #[test]
  fn a_data_error_after_the_code_means_a_wrong_code() {
    let mapped = failure_error(
      &failure(FailureType::DataError, Some("Unexpected Code Entry Tag")),
      Step::PairCode,
    );
    assert_eq!(mapped.kind, ErrorKind::PairingRejected);
    assert!(mapped.message.contains("wrong"), "{}", mapped.message);
    assert!(mapped.message.contains("Start again"), "{}", mapped.message);
  }

  #[test]
  fn another_failure_after_the_code_does_not_say_that_the_code_was_wrong() {
    for code in [
      FailureType::Busy,
      FailureType::InProgress,
      FailureType::InvalidSession,
      FailureType::ThpUnallocatedSession,
      FailureType::FirmwareError,
      FailureType::PinExpected,
      FailureType::ProcessError,
    ] {
      let mapped = failure_error(&failure(code, None), Step::PairCode);
      assert!(
        !mapped.message.contains("wrong"),
        "{code:?}: {}",
        mapped.message
      );
    }
    let busy = failure_error(&failure(FailureType::Busy, None), Step::PairCode);
    assert!(busy.message.contains("busy"), "{}", busy.message);
    let lost = failure_error(&failure(FailureType::InvalidSession, None), Step::PairCode);
    assert!(lost.message.contains("lost contact"), "{}", lost.message);
    let pin = failure_error(&failure(FailureType::PinExpected, None), Step::PairCode);
    assert!(pin.message.contains("PIN"), "{}", pin.message);
  }

  #[test]
  fn a_stop_by_the_device_on_the_code_screen_names_both_causes() {
    let mapped = failure_error(&failure(FailureType::ActionCancelled, None), Step::PairCode);
    assert_eq!(mapped.kind, ErrorKind::PairingRejected);
    for phrase in [
      "stopped the pairing",
      "cancelled on it",
      "locked itself",
      "Start again",
    ] {
      assert!(mapped.message.contains(phrase), "{}", mapped.message);
    }
  }

  #[test]
  fn a_device_without_a_wallet_is_not_initialized() {
    let mapped = failure_error(&failure(FailureType::NotInitialized, None), Step::Query);
    assert_eq!(mapped.kind, ErrorKind::NotInitialized);
  }

  #[test]
  fn a_busy_device_asks_to_close_trezor_suite() {
    for code in [FailureType::Busy, FailureType::InProgress] {
      let mapped = failure_error(&failure(code, None), Step::Query);
      assert_eq!(mapped.kind, ErrorKind::Communication);
      assert!(
        mapped.message.contains("Trezor Suite"),
        "{}",
        mapped.message
      );
    }
  }

  #[test]
  fn a_forbidden_key_path_is_its_own_error() {
    for step in [Step::Query, Step::Sign] {
      let mapped = failure_error(
        &failure(FailureType::DataError, Some("Forbidden key path")),
        step,
      );
      // It is not "the key is not in the vault": the session must not ask for a passphrase.
      assert_eq!(mapped.kind, ErrorKind::ForbiddenKeyPath, "{step:?}");
      assert!(
        mapped.message.contains("network that you selected"),
        "{}",
        mapped.message
      );
    }
  }

  #[test]
  fn the_text_of_the_device_is_never_shown() {
    let text = "Restore your seed at example.com";
    for (code, step) in [
      (FailureType::DataError, Step::Sign),
      (FailureType::DataError, Step::Query),
      (FailureType::DataError, Step::Pair),
      (FailureType::ProcessError, Step::Sign),
      (FailureType::FirmwareError, Step::Query),
      (FailureType::NotEnoughFunds, Step::Sign),
      (FailureType::Busy, Step::Query),
      (FailureType::PinInvalid, Step::Query),
      (FailureType::WipeCodeMismatch, Step::Query),
    ] {
      let mapped = failure_error(&failure(code, Some(text)), step);
      assert!(
        !mapped.message.contains("example.com") && !mapped.message.contains("Restore"),
        "{code:?} {step:?}: {}",
        mapped.message
      );
    }
    let mapped = failure_error(
      &Failure {
        code: Some(4242),
        message: Some(text.to_string()),
      },
      Step::Query,
    );
    assert!(
      !mapped.message.contains("example.com"),
      "{}",
      mapped.message
    );
  }

  #[test]
  fn a_refused_transaction_has_the_sentence_of_svra() {
    for code in [
      FailureType::DataError,
      FailureType::ProcessError,
      FailureType::FirmwareError,
    ] {
      let mapped = failure_error(&failure(code, Some("Invalid amount")), Step::Sign);
      assert_eq!(mapped.kind, ErrorKind::InvalidPsbt);
      assert!(
        mapped.message.contains("refused the transaction"),
        "{}",
        mapped.message
      );
    }
  }

  #[test]
  fn a_signature_failure_is_an_invalid_signature() {
    let mapped = failure_error(&failure(FailureType::InvalidSignature, None), Step::Sign);
    assert_eq!(mapped.kind, ErrorKind::InvalidSignature);
  }

  #[test]
  fn an_unknown_failure_shows_its_code() {
    let mapped = failure_error(
      &Failure {
        code: None,
        message: None,
      },
      Step::Query,
    );
    assert_eq!(mapped.kind, ErrorKind::Other);
    assert!(mapped.message.contains("code none"), "{}", mapped.message);
    let mapped = failure_error(
      &Failure {
        code: Some(4242),
        message: None,
      },
      Step::Query,
    );
    assert_eq!(mapped.kind, ErrorKind::Other);
    assert!(mapped.message.contains("code 4242"), "{}", mapped.message);
  }

  #[test]
  fn pin_failures_are_user_aborts() {
    let mapped = failure_error(&failure(FailureType::PinCancelled, None), Step::Query);
    assert_eq!(mapped.kind, ErrorKind::UserAbort);
    let mapped = failure_error(&failure(FailureType::PinInvalid, None), Step::Query);
    assert_eq!(mapped.kind, ErrorKind::UserAbort);
  }

  #[test]
  fn link_errors_become_communication_errors() {
    for link in [
      LinkError::Transport(TransportError::Disconnected),
      LinkError::Transport(TransportError::Failed),
      LinkError::Timeout,
      LinkError::UserTimeout,
      LinkError::ChannelLost,
      LinkError::Protocol,
    ] {
      let mapped = link_error(link);
      assert_eq!(mapped.kind, ErrorKind::Communication, "{link:?}");
    }
  }

  #[test]
  fn an_unplugged_device_says_so() {
    let mapped = link_error(LinkError::Transport(TransportError::Disconnected));
    assert!(mapped.message.contains("unplugged"), "{}", mapped.message);
  }

  #[test]
  fn only_a_wait_of_ten_minutes_says_that_svra_waited_ten_minutes() {
    let user = link_error(LinkError::UserTimeout);
    assert!(user.message.contains("ten minutes"), "{}", user.message);
    assert!(
      user.message.contains("Nothing was signed"),
      "{}",
      user.message
    );
    let short = link_error(LinkError::Timeout);
    assert!(!short.message.contains("ten minutes"), "{}", short.message);
    assert!(
      short.message.contains("stopped answering"),
      "{}",
      short.message
    );
    assert!(short.message.contains("Unplug"), "{}", short.message);
  }

  #[test]
  fn a_locked_device_that_stays_locked_is_a_user_abort() {
    let mapped = link_error(LinkError::DeviceLocked);
    assert_eq!(mapped.kind, ErrorKind::UserAbort);
    assert!(mapped.message.contains("PIN"), "{}", mapped.message);
  }
}
