// Trezor Safe 7 support. SVRA talks to the device itself and does not use HWI for it, because HWI
// cannot speak the Trezor Host Protocol that a Safe 7 needs.

use bdk_wallet::bitcoin::Psbt;
use serde::Serialize;
use serde_json::{json, Value};
use specta::Type;
use std::str::FromStr;
use std::time::Duration;
use svra_trezor::{
  CodeEntry, DetectedDevice, PairingCodes, Progress, SignRequest, Ui, Wait, BOOTLOADER_MESSAGE,
  BUSY_MESSAGE,
};
use tauri::ipc::Channel;
use tauri::Manager;

use crate::errors::{HwiErrorType, SvraError, SvraErrorType};
use crate::extract_txid;
use crate::network::Network;

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

/// A session that waits for a code in a window that closes has nobody to ask.
pub fn window_closed(label: &str) {
  PAIRING.cancel_owned_by(label);
}

/// The error for a scan that finds no device while a Safe 7 session runs.
pub fn busy_error() -> SvraError {
  SvraError::new(SvraErrorType::TrezorError, BUSY_MESSAGE)
}

/// True while a Safe 7 session holds the device.
pub fn session_running() -> bool {
  svra_trezor::session_running()
}

/// Lists the Trezor Safe 7 devices on USB, in the JSON shape of `hwi enumerate`. Returns no
/// entries when there is no device or the scan fails, so that a failed scan hides neither a
/// BitBox02 nor the devices that HWI finds. A debug build prints what the scan saw when it finds
/// no Safe 7, and why it failed when it fails.
pub async fn enumerate() -> Vec<Value> {
  match tokio::task::spawn_blocking(svra_trezor::scan_report).await {
    Ok(Ok(report)) => {
      if cfg!(debug_assertions) && report.devices.is_empty() {
        eprintln!("Trezor Safe 7 scan found no Safe 7: {report}");
      }
      device_entries(&report.devices)
    }
    Ok(Err(error)) => {
      if cfg!(debug_assertions) {
        eprintln!("Trezor Safe 7 scan failed: {}", error.message);
      }
      Vec::new()
    }
    Err(error) => {
      if cfg!(debug_assertions) {
        eprintln!("Trezor Safe 7 scan task failed: {error}");
      }
      Vec::new()
    }
  }
}

/// True when the text of `hwi enumerate` is a list with at least one Trezor. HWI reports every
/// Trezor model as `trezor`, so the answer does not say whether the device is a Safe 7.
pub fn hwi_lists_a_trezor(hwi_listing: &str) -> bool {
  match serde_json::from_str::<Value>(hwi_listing) {
    Ok(Value::Array(entries)) => entries.iter().any(|entry| entry["type"] == "trezor"),
    _ => false,
  }
}

/// Looks for a Safe 7 once more when HWI lists a Trezor. Returns the list of the Safe 7 devices
/// that the second scan finds, as JSON. Returns `None` when HWI lists no Trezor, without a scan,
/// and when the second scan finds no Safe 7: then the Trezor is another model, and HWI keeps it.
pub async fn rescan_after_hwi(hwi_listing: &str) -> Option<String> {
  if !hwi_lists_a_trezor(hwi_listing) {
    return None;
  }
  let entries = enumerate().await;
  if entries.is_empty() {
    return None;
  }
  if cfg!(debug_assertions) {
    eprintln!("The first scan missed a Trezor Safe 7 that the second scan found.");
  }
  serde_json::to_string(&entries).ok()
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
        entry["code"] = json!(HwiErrorType::DeviceNotReady as i32);
      }
      entry
    })
    .collect()
}

// The session thread's view of the window. The wait for the pairing code opens before the
// window hears about the step, so a fast answer cannot arrive before the wait exists.
struct SessionUi {
  on_progress: Channel<TrezorProgress>,
  window: tauri::Window,
  wait: Option<Wait<'static>>,
}

impl SessionUi {
  // The window is gone when the app no longer lists it.
  fn window_is_open(&self) -> bool {
    self
      .window
      .get_webview_window(self.window.label())
      .is_some()
  }
}

impl Ui for SessionUi {
  fn progress(&mut self, progress: Progress) {
    if progress == Progress::EnterPairingCode {
      // The wait opens first, and then the window is checked. A window that closes from now on
      // cancels the wait through `window_closed`. A window that is gone already gets no wait,
      // because nobody could answer it.
      let wait = PAIRING.begin(self.window.label());
      self.wait = self.window_is_open().then_some(wait);
    }
    // A send to a window that closed does not fail from this thread. The code step above is the
    // only step that needs the window, so the result is not used.
    let _ = self.on_progress.send(progress.into());
  }

  fn pairing_code(&mut self, wait: Duration) -> CodeEntry {
    match &self.wait {
      Some(wait_for_code) => wait_for_code.poll(wait),
      None => CodeEntry::Cancelled,
    }
  }
}

pub async fn sign(
  psbt: String,
  network: Network,
  receive_descriptor: String,
  change_descriptor: Option<String>,
  on_progress: Channel<TrezorProgress>,
  window: tauri::Window,
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
      window,
      wait: None,
    };
    svra_trezor::sign_psbt_usb(&PAIRING, request, &mut ui)
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

  // What `hwi enumerate` prints for a Trezor that it cannot open.
  const HWI_TREZOR_WITH_ERROR: &str = r#"[{"type": "trezor", "model": "trezor_t", "path": "webusb:003:1:1:4", "needs_pin_sent": false, "needs_passphrase_sent": false, "error": "Could not open client or get fingerprint information: Trezor is in bootloader mode", "code": -12}]"#;
  const HWI_TREZOR_READY: &str = r#"[{"type": "trezor", "model": "trezor_t", "label": "", "path": "webusb:003:1:1:4", "fingerprint": "8f4c9a21", "needs_pin_sent": false, "needs_passphrase_sent": false}]"#;
  const HWI_JADE: &str = r#"[{"type": "jade", "model": "jade", "path": "/dev/cu.usbserial-1420", "needs_pin_sent": false, "needs_passphrase_sent": false, "fingerprint": "0c3e5d7a"}]"#;

  #[test]
  fn hwi_lists_a_trezor_that_it_could_not_open() {
    assert!(hwi_lists_a_trezor(HWI_TREZOR_WITH_ERROR));
  }

  #[test]
  fn hwi_lists_a_trezor_that_it_opened() {
    assert!(hwi_lists_a_trezor(HWI_TREZOR_READY));
  }

  #[test]
  fn hwi_lists_a_trezor_among_other_devices() {
    let listing = format!(
      "[{}, {}]",
      &HWI_JADE[1..HWI_JADE.len() - 1],
      &HWI_TREZOR_READY[1..HWI_TREZOR_READY.len() - 1]
    );
    assert!(hwi_lists_a_trezor(&listing));
  }

  #[test]
  fn hwi_lists_no_trezor_in_a_list_with_only_a_jade() {
    assert!(!hwi_lists_a_trezor(HWI_JADE));
  }

  #[test]
  fn hwi_lists_no_trezor_in_an_empty_list() {
    assert!(!hwi_lists_a_trezor("[]"));
  }

  #[test]
  fn hwi_lists_no_trezor_in_text_that_is_not_json() {
    assert!(!hwi_lists_a_trezor(""));
    assert!(!hwi_lists_a_trezor("Traceback (most recent call last):"));
  }

  #[test]
  fn hwi_lists_no_trezor_in_a_json_object() {
    // HWI prints an object for some failures.
    assert!(!hwi_lists_a_trezor(
      r#"{"error": "Unable to open device", "code": -1, "type": "trezor"}"#
    ));
  }

  #[tokio::test]
  async fn no_rescan_runs_when_hwi_lists_no_trezor() {
    for listing in [HWI_JADE, "[]", "not json"] {
      assert_eq!(rescan_after_hwi(listing).await, None);
    }
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
  fn the_busy_error_tells_the_user_to_unplug_the_device() {
    let error = busy_error();
    assert_eq!(error.error_type, "TrezorError");
    assert!(
      error.message.contains("earlier signing attempt"),
      "{}",
      error.message
    );
    assert!(error.message.contains("Unplug"), "{}", error.message);
  }

  #[test]
  fn the_commands_refuse_when_no_session_waits() {
    // The tests of the hand-over itself are in the crate. This one covers the message and the
    // error type that the window sees.
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
