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
  /// Opening the channel: allocation and handshake.
  Connect,
  /// Waiting for the user to unlock the device.
  Unlock,
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

/// The longest device text that a message repeats. The text comes from the device, so the
/// message keeps the printable characters of the first part and nothing else.
const MAX_DEVICE_TEXT: usize = 100;

fn error(kind: ErrorKind, message: impl Into<String>) -> Error {
  Error::new(kind, message)
}

fn user_waits(step: Step) -> bool {
  matches!(
    step,
    Step::Unlock | Step::Pair | Step::PairCode | Step::Passphrase | Step::Sign
  )
}

fn device_text(failure: &Failure) -> Option<String> {
  let text: String = failure
    .message
    .as_deref()?
    .chars()
    .filter(|c| c.is_ascii() && !c.is_ascii_control())
    .take(MAX_DEVICE_TEXT)
    .collect();
  let text = text.trim();
  (!text.is_empty()).then(|| text.to_string())
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
pub(crate) fn link_error(link_error: LinkError, step: Step) -> Error {
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
    LinkError::Timeout if user_waits(step) => error(
      ErrorKind::Communication,
      "SVRA waited ten minutes for you on the Trezor Safe 7. Nothing was signed. Start again when you are ready.",
    ),
    LinkError::Timeout => error(
      ErrorKind::Communication,
      format!(
        "The Trezor Safe 7 did not answer in time. {SUITE_ADVICE} {RESTART_ADVICE}"
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

/// The error for a `Failure` message of the device.
pub(crate) fn failure_error(failure: &Failure, step: Step) -> Error {
  let code = failure
    .code
    .and_then(|code| FailureType::try_from(code).ok());
  let text = device_text(failure);
  let with_text = |lead: &str| match &text {
    Some(text) => format!("{lead} The Trezor Safe 7 says: \"{text}\"."),
    None => lead.to_string(),
  };
  match (code, step) {
    (Some(FailureType::ActionCancelled), Step::Pair | Step::PairCode) => error(
      ErrorKind::PairingRejected,
      "The pairing was cancelled on the Trezor Safe 7. Start again, and allow the connection when the Trezor Safe 7 asks.",
    ),
    (Some(FailureType::ActionCancelled), _) => error(
      ErrorKind::UserAbort,
      "You cancelled on the Trezor Safe 7. Nothing was signed. Start again when you are ready.",
    ),
    // The device rejects a tag that does not fit the code with a data error.
    (_, Step::PairCode) => error(
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
    (_, Step::Query) if text.as_deref().is_some_and(|text| text.contains("Forbidden key path")) => {
      error(
        ErrorKind::KeyNotInVault,
        "The Trezor Safe 7 refuses to give the key that your vault uses. Check that the wallet configuration is the one from your Swan Vault Recovery Sheet. If it is, contact Swan support.",
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
    (_, Step::Sign) => error(
      ErrorKind::InvalidPsbt,
      with_text("The Trezor Safe 7 refused the transaction. Check that the transaction and the wallet configuration are from the same vault. If they are, create the transaction again with SVRA."),
    ),
    (_, _) => error(
      ErrorKind::Other,
      with_text(&format!(
        "The Trezor Safe 7 returned an error that SVRA does not know. {RESTART_ADVICE}"
      )),
    ),
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
  fn cancelling_while_signing_is_a_user_abort() {
    let mapped = failure_error(&failure(FailureType::ActionCancelled, None), Step::Sign);
    assert_eq!(mapped.kind, ErrorKind::UserAbort);
    assert!(
      mapped.message.contains("Nothing was signed"),
      "{}",
      mapped.message
    );
  }

  #[test]
  fn cancelling_the_connection_dialog_is_a_refused_pairing() {
    let mapped = failure_error(&failure(FailureType::ActionCancelled, None), Step::Pair);
    assert_eq!(mapped.kind, ErrorKind::PairingRejected);
    assert!(mapped.message.contains("Start again"), "{}", mapped.message);
  }

  #[test]
  fn any_other_failure_after_the_code_means_a_wrong_code() {
    let mapped = failure_error(
      &failure(FailureType::DataError, Some("Unexpected Code Entry Tag")),
      Step::PairCode,
    );
    assert_eq!(mapped.kind, ErrorKind::PairingRejected);
    assert!(mapped.message.contains("wrong"), "{}", mapped.message);
    assert!(mapped.message.contains("Start again"), "{}", mapped.message);
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
  fn a_forbidden_key_path_is_explained() {
    let mapped = failure_error(
      &failure(FailureType::DataError, Some("Forbidden key path")),
      Step::Query,
    );
    assert_eq!(mapped.kind, ErrorKind::KeyNotInVault);
  }

  #[test]
  fn a_refused_transaction_repeats_the_printable_start_of_the_device_text() {
    let long = format!("Invalid amount\u{0007}\u{00e9}{}", "x".repeat(300));
    let mapped = failure_error(&failure(FailureType::DataError, Some(&long)), Step::Sign);
    assert_eq!(mapped.kind, ErrorKind::InvalidPsbt);
    assert!(
      mapped.message.contains("Invalid amount"),
      "{}",
      mapped.message
    );
    assert!(!mapped.message.contains('\u{0007}'));
    assert!(!mapped.message.contains('\u{00e9}'));
    assert!(mapped.message.len() < 400, "{}", mapped.message.len());
  }

  #[test]
  fn a_signature_failure_is_an_invalid_signature() {
    let mapped = failure_error(&failure(FailureType::InvalidSignature, None), Step::Sign);
    assert_eq!(mapped.kind, ErrorKind::InvalidSignature);
  }

  #[test]
  fn a_failure_without_a_code_is_an_unknown_error() {
    let mapped = failure_error(
      &Failure {
        code: None,
        message: None,
      },
      Step::Query,
    );
    assert_eq!(mapped.kind, ErrorKind::Other);
    let mapped = failure_error(
      &Failure {
        code: Some(4242),
        message: None,
      },
      Step::Query,
    );
    assert_eq!(mapped.kind, ErrorKind::Other);
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
    for (link, step) in [
      (
        LinkError::Transport(TransportError::Disconnected),
        Step::Sign,
      ),
      (LinkError::Transport(TransportError::Failed), Step::Connect),
      (LinkError::Timeout, Step::Query),
      (LinkError::ChannelLost, Step::Sign),
      (LinkError::Protocol, Step::Sign),
    ] {
      let mapped = link_error(link, step);
      assert_eq!(mapped.kind, ErrorKind::Communication, "{link:?}");
    }
  }

  #[test]
  fn an_unplugged_device_says_so() {
    let mapped = link_error(
      LinkError::Transport(TransportError::Disconnected),
      Step::Sign,
    );
    assert!(mapped.message.contains("unplugged"), "{}", mapped.message);
  }

  #[test]
  fn a_timeout_while_the_user_acts_says_that_nothing_was_signed() {
    let mapped = link_error(LinkError::Timeout, Step::Sign);
    assert!(
      mapped.message.contains("Nothing was signed"),
      "{}",
      mapped.message
    );
    let mapped = link_error(LinkError::Timeout, Step::Query);
    assert!(
      mapped.message.contains("did not answer"),
      "{}",
      mapped.message
    );
  }

  #[test]
  fn a_locked_device_that_stays_locked_is_a_user_abort() {
    let mapped = link_error(LinkError::DeviceLocked, Step::Unlock);
    assert_eq!(mapped.kind, ErrorKind::UserAbort);
    assert!(mapped.message.contains("PIN"), "{}", mapped.message);
  }
}
