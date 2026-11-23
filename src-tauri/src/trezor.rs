// Trezor Safe 7 support. SVRA talks to the device itself and does not use HWI for it, because HWI
// cannot speak the Trezor Host Protocol that a Safe 7 needs.

use bdk_wallet::bitcoin::Psbt;
use serde::Serialize;
use serde_json::{json, Value};
use specta::Type;
use std::str::FromStr;
use svra_trezor::{DetectedDevice, Progress, SignRequest, Ui, BOOTLOADER_MESSAGE};
use tauri::ipc::Channel;

use crate::errors::{SvraError, SvraErrorType};
use crate::extract_txid;
use crate::network::Network;
use crate::trezor_pairing::{PairingCodes, Wait};

// HWI error code for "device is not ready".
const HWI_DEVICE_NOT_READY: i32 = -12;

// The one place where the window and the device session meet.
static PAIRING: PairingCodes = PairingCodes::new();

// What the device session is doing. The frontend shows a matching instruction for each step.
// This is a plain comment because the binding generator copies doc comments into bindings.ts.
#[derive(Clone, Debug, Serialize, Type)]
#[serde(tag = "step", rename_all = "kebab-case")]
pub enum TrezorProgress {
  Connecting,
  Unlock,
  ConfirmConnection,
  EnterPairingCode,
  CheckingKey,
  Passphrase,
  Sign,
}

impl From<Progress> for TrezorProgress {
  fn from(progress: Progress) -> Self {
    match progress {
      Progress::Connecting => TrezorProgress::Connecting,
      Progress::Unlock => TrezorProgress::Unlock,
      Progress::ConfirmConnection => TrezorProgress::ConfirmConnection,
      Progress::EnterPairingCode => TrezorProgress::EnterPairingCode,
      Progress::CheckingKey => TrezorProgress::CheckingKey,
      Progress::Passphrase => TrezorProgress::Passphrase,
      Progress::Sign => TrezorProgress::Sign,
    }
  }
}

fn not_waiting() -> SvraError {
  SvraError::new(
    SvraErrorType::TrezorError,
    "SVRA is not waiting for a pairing code. Start signing again.",
  )
}

/// Gives the pairing code that the user typed to the session that waits for it.
pub fn submit_pairing_code(code: String) -> Result<(), SvraError> {
  PAIRING.submit(code).map_err(|_| not_waiting())
}

/// Ends the session that waits for a pairing code.
pub fn cancel_pairing() -> Result<(), SvraError> {
  PAIRING.cancel().map_err(|_| not_waiting())
}

/// A session that waits for a code in a window that closes would wait forever.
pub fn window_closed(label: &str) {
  PAIRING.cancel_owned_by(label);
}

/// Lists the Trezor Safe 7 devices on USB, in the JSON shape of `hwi enumerate`. Returns no
/// entries when there is no device or the scan fails, so that a failed scan hides neither a
/// BitBox02 nor the devices that HWI finds.
pub async fn enumerate() -> Vec<Value> {
  match tokio::task::spawn_blocking(svra_trezor::scan).await {
    Ok(Ok(devices)) => device_entries(&devices),
    _ => Vec::new(),
  }
}

fn device_entries(devices: &[DetectedDevice]) -> Vec<Value> {
  devices
    .iter()
    .map(|device| {
      let mut entry = json!({
        "type": "trezor_safe7",
        "model": device.model,
        "path": device.path,
        "needs_pin_sent": false,
        "needs_passphrase_sent": false,
        "fingerprint": null,
      });
      if device.bootloader {
        entry["error"] = json!(BOOTLOADER_MESSAGE);
        entry["code"] = json!(HWI_DEVICE_NOT_READY);
      }
      entry
    })
    .collect()
}

// The session thread's view of the window. The wait for the pairing code opens before the
// window hears about the step, so a fast answer cannot arrive before the wait exists.
struct SessionUi {
  on_progress: Channel<TrezorProgress>,
  owner: String,
  wait: Option<Wait<'static>>,
}

impl Ui for SessionUi {
  fn progress(&mut self, progress: Progress) {
    let asks_for_code = progress == Progress::EnterPairingCode;
    if asks_for_code {
      self.wait = Some(PAIRING.begin(&self.owner));
    }
    // The window may be gone. Then nobody can type the code, so the session must not wait for it.
    if self.on_progress.send(progress.into()).is_err() && asks_for_code {
      self.wait = None;
    }
  }

  fn pairing_code(&mut self) -> Option<String> {
    self.wait.take()?.recv()
  }
}

pub async fn sign(
  psbt: String,
  network: Network,
  receive_descriptor: String,
  change_descriptor: Option<String>,
  on_progress: Channel<TrezorProgress>,
  window_label: String,
) -> Result<String, SvraError> {
  // grab the txid before the device sees the PSBT so that we can detect unexpected edits. This is
  // the same check that the HWI path makes.
  let txid = extract_txid(&psbt)?;
  let psbt = resolve!(Psbt::from_str(&psbt), SvraErrorType::PsbtError);

  // the device session blocks on user input and must stay on one thread from start to end.
  let outcome = tokio::task::spawn_blocking(move || {
    let request = SignRequest {
      network: network.into(),
      receive_descriptor: &receive_descriptor,
      change_descriptor: change_descriptor.as_deref(),
      psbt,
    };
    let mut ui = SessionUi {
      on_progress,
      owner: window_label,
      wait: None,
    };
    svra_trezor::sign_psbt_usb(request, &mut ui)
  })
  .await
  .map_err(|_| {
    SvraError::new(
      SvraErrorType::TrezorError,
      "The Trezor Safe 7 session ended unexpectedly. Unplug the Trezor Safe 7, plug it in again and retry.",
    )
  })?
  .map_err(SvraError::from_trezor)?;

  let signed_psbt = outcome.psbt.to_string();
  if extract_txid(&signed_psbt)? != txid {
    return Err(SvraError::new(
      SvraErrorType::TransactionError,
      "The signed transaction does not match the original transaction. There may be have been malicious edit to the transaction.",
    ));
  }

  Ok(
    json!({
      "psbt": signed_psbt,
      "signed": outcome.signed,
      "fingerprint": outcome.fingerprint.to_string(),
    })
    .to_string(),
  )
}

#[cfg(test)]
mod tests {
  use super::*;

  fn detected(bootloader: bool) -> DetectedDevice {
    DetectedDevice {
      model: "trezor_safe_7".to_string(),
      path: "1:7".to_string(),
      bootloader,
    }
  }

  #[test]
  fn a_safe_7_entry_has_the_shape_of_an_hwi_entry() {
    let entries = device_entries(&[detected(false)]);
    assert_eq!(
      entries,
      vec![json!({
        "type": "trezor_safe7",
        "model": "trezor_safe_7",
        "path": "1:7",
        "needs_pin_sent": false,
        "needs_passphrase_sent": false,
        "fingerprint": null,
      })]
    );
  }

  #[test]
  fn a_safe_7_in_bootloader_mode_carries_an_error_and_the_not_ready_code() {
    let entries = device_entries(&[detected(true)]);
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0]["type"], "trezor_safe7");
    assert_eq!(entries[0]["error"], BOOTLOADER_MESSAGE);
    assert_eq!(entries[0]["code"], -12);
  }

  #[test]
  fn there_is_one_entry_for_each_device() {
    assert!(device_entries(&[]).is_empty());
    assert_eq!(device_entries(&[detected(false), detected(true)]).len(), 2);
  }

  #[test]
  fn progress_serializes_as_a_kebab_case_step() {
    let steps = [
      (Progress::Connecting, "connecting"),
      (Progress::Unlock, "unlock"),
      (Progress::ConfirmConnection, "confirm-connection"),
      (Progress::EnterPairingCode, "enter-pairing-code"),
      (Progress::CheckingKey, "checking-key"),
      (Progress::Passphrase, "passphrase"),
      (Progress::Sign, "sign"),
    ];
    for (progress, step) in steps {
      let value = serde_json::to_value(TrezorProgress::from(progress)).unwrap();
      assert_eq!(value, json!({ "step": step }));
    }
  }

  #[test]
  fn the_commands_refuse_when_no_session_waits() {
    // The tests of the hand-over itself are in trezor_pairing.rs. This one covers the message
    // and the error type that the window sees.
    let error = cancel_pairing().unwrap_err();
    assert_eq!(error.error_type, "TrezorError");
    assert!(error.message.contains("not waiting"));
    assert_eq!(
      submit_pairing_code("123456".to_string())
        .unwrap_err()
        .error_type,
      "TrezorError"
    );
  }
}
