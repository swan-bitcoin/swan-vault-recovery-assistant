// BitBox02 support. SVRA talks to the device itself and does not use HWI for it, because HWI
// can only build the sorted multisig format, which does not match a Swan vault.

use bdk_wallet::bitcoin::Psbt;
use serde::Serialize;
use serde_json::json;
use specta::Type;
use std::str::FromStr;
use svra_bitbox02::{DetectedDevice, Progress, SignRequest, BOOTLOADER_MESSAGE};
use tauri::ipc::Channel;

use crate::errors::{SvraError, SvraErrorType};
use crate::extract_txid;
use crate::network::Network;

// HWI error code for "device is not ready".
const HWI_DEVICE_NOT_READY: i32 = -12;

// What the device session is doing. The frontend shows a matching instruction for each step.
// This is a plain comment because the binding generator copies doc comments into bindings.ts.
#[derive(Clone, Debug, Serialize, Type)]
#[serde(tag = "step", rename_all = "kebab-case")]
pub enum Bitbox02Progress {
  Connecting,
  Unlock,
  ConfirmPairing { code: String },
  CheckingRegistration,
  Register { name: String },
  Sign,
}

impl From<Progress> for Bitbox02Progress {
  fn from(progress: Progress) -> Self {
    match progress {
      Progress::Connecting => Bitbox02Progress::Connecting,
      Progress::Unlock => Bitbox02Progress::Unlock,
      Progress::ConfirmPairing { code } => Bitbox02Progress::ConfirmPairing { code },
      Progress::CheckingRegistration => Bitbox02Progress::CheckingRegistration,
      Progress::Register { name } => Bitbox02Progress::Register { name },
      Progress::Sign => Bitbox02Progress::Sign,
    }
  }
}

/// Lists the BitBox02 devices on USB, in the JSON shape of `hwi enumerate`. Returns no entries
/// when there is no device or the scan fails, so that a failed scan hides no device that another
/// scan or HWI finds.
pub async fn enumerate() -> Vec<serde_json::Value> {
  match tokio::task::spawn_blocking(svra_bitbox02::scan_report).await {
    Ok(Ok(report)) => {
      #[cfg(debug_assertions)]
      {
        if report.devices.is_empty() {
          eprintln!("BitBox02 scan found no BitBox02: {report}");
        }
      }
      device_entries(&report.devices)
    }
    Ok(Err(_error)) => {
      #[cfg(debug_assertions)]
      eprintln!("BitBox02 scan failed: {_error}");
      Vec::new()
    }
    Err(_error) => {
      #[cfg(debug_assertions)]
      eprintln!("BitBox02 scan task failed: {_error}");
      Vec::new()
    }
  }
}

/// One entry in the shape of `hwi enumerate`. `device_entries` and `adopt_hwi_listing` both build
/// their entries here, so the two shapes cannot differ.
fn entry(model: &str, path: &str) -> serde_json::Value {
  json!({
    "type": "bitbox02",
    "model": model,
    "path": path,
    "needs_pin_sent": false,
    "needs_passphrase_sent": false,
    "fingerprint": null,
  })
}

fn device_entries(devices: &[DetectedDevice]) -> Vec<serde_json::Value> {
  devices
    .iter()
    .map(|device| {
      let mut entry = entry(&device.model, &device.path);
      if device.bootloader {
        entry["error"] = json!(BOOTLOADER_MESSAGE);
        entry["code"] = json!(HWI_DEVICE_NOT_READY);
      }
      entry
    })
    .collect()
}

/// Takes over a BitBox02 that the USB scan missed and that HWI lists. Returns the JSON list of the
/// BitBox02 entries of `hwi_listing`, or `None` when HWI lists no BitBox02.
///
/// The entries carry neither HWI's error nor its code. They describe the session of HWI, not the
/// device. SVRA's own session reports the real state of the device.
pub fn adopt_hwi_listing(hwi_listing: &str) -> Option<String> {
  let listing: serde_json::Value = serde_json::from_str(hwi_listing).ok()?;
  let entries: Vec<serde_json::Value> = listing
    .as_array()?
    .iter()
    .filter(|hwi_entry| hwi_entry["type"] == "bitbox02")
    .map(|hwi_entry| {
      entry(
        hwi_entry["model"].as_str().unwrap_or("bitbox02"),
        hwi_entry["path"].as_str().unwrap_or(""),
      )
    })
    .collect();
  if entries.is_empty() {
    return None;
  }
  #[cfg(debug_assertions)]
  eprintln!(
    "HWI listed a BitBox02 that the USB scan did not find. SVRA uses its own BitBox02 path."
  );
  serde_json::to_string(&entries).ok()
}

pub async fn sign(
  psbt: String,
  network: Network,
  receive_descriptor: String,
  change_descriptor: Option<String>,
  on_progress: Channel<Bitbox02Progress>,
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
    // the window may be gone, and then nobody needs the progress.
    svra_bitbox02::sign_psbt_usb(request, &mut |progress| {
      let _ = on_progress.send(progress.into());
    })
  })
  .await
  .map_err(|_| {
    SvraError::new(
      SvraErrorType::Bitbox02Error,
      "The BitBox02 session ended unexpectedly. Unplug the BitBox02, plug it in again and retry.",
    )
  })?
  .map_err(SvraError::from_bitbox02)?;

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
  use std::collections::BTreeSet;

  const HWI_NOT_PAIRED: &str = r#"[{"error": "Could not open client or get fingerprint information: Device not paired yet. Please pair using the BitBoxApp, then close the BitBoxApp and try again.", "code": -12, "type": "bitbox02", "path": "DevSrvsID:4295058923", "model": "bitbox02_nova_btconly", "needs_pin_sent": false, "needs_passphrase_sent": false}]"#;

  const HWI_JADE: &str = r#"{"type": "jade", "model": "jade", "path": "/dev/cu.usbserial-0001", "needs_pin_sent": false, "needs_passphrase_sent": false, "fingerprint": "0a1b2c3d"}"#;

  fn adopted(listing: &str) -> Vec<serde_json::Value> {
    let json = adopt_hwi_listing(listing).expect("a BitBox02 is adopted");
    serde_json::from_str(&json).expect("the result is a JSON array")
  }

  fn keys(entry: &serde_json::Value) -> BTreeSet<String> {
    entry
      .as_object()
      .expect("an entry is an object")
      .keys()
      .cloned()
      .collect()
  }

  fn firmware_device() -> DetectedDevice {
    DetectedDevice {
      model: "bitbox02_nova_btconly".to_string(),
      path: "DevSrvsID:4295058923".to_string(),
      bootloader: false,
    }
  }

  #[test]
  fn the_answer_of_hwi_for_an_unpaired_bitbox02_is_adopted_without_its_error() {
    let entries = adopted(HWI_NOT_PAIRED);
    assert_eq!(entries.len(), 1);
    let entry = &entries[0];
    assert_eq!(entry["type"], "bitbox02");
    assert_eq!(entry["model"], "bitbox02_nova_btconly");
    assert_eq!(entry["path"], "DevSrvsID:4295058923");
    assert!(entry.get("error").is_none(), "{entry}");
    assert!(entry.get("code").is_none(), "{entry}");
  }

  #[test]
  fn only_the_bitbox02_entries_of_a_mixed_list_are_adopted() {
    let listing = format!(
      "[{HWI_JADE}, {}]",
      &HWI_NOT_PAIRED[1..HWI_NOT_PAIRED.len() - 1]
    );
    let entries = adopted(&listing);
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0]["type"], "bitbox02");
  }

  #[test]
  fn a_list_without_a_bitbox02_is_not_adopted() {
    assert_eq!(adopt_hwi_listing(&format!("[{HWI_JADE}]")), None);
  }

  #[test]
  fn an_empty_list_text_that_is_not_json_and_an_object_are_not_adopted() {
    assert_eq!(adopt_hwi_listing("[]"), None);
    assert_eq!(adopt_hwi_listing("not json"), None);
    assert_eq!(adopt_hwi_listing(""), None);
    assert_eq!(
      adopt_hwi_listing(r#"{"error": "No HID devices found", "code": -1}"#),
      None
    );
  }

  #[test]
  fn an_entry_without_a_model_and_a_path_gets_the_fallback_values() {
    let entries = adopted(r#"[{"type": "bitbox02", "error": "x", "code": -12}]"#);
    assert_eq!(entries[0]["model"], "bitbox02");
    assert_eq!(entries[0]["path"], "");
  }

  #[test]
  fn an_adopted_entry_has_the_keys_of_an_entry_for_a_firmware_device() {
    let entries = adopted(HWI_NOT_PAIRED);
    let from_scan = device_entries(&[firmware_device()]);
    assert_eq!(keys(&entries[0]), keys(&from_scan[0]));
    assert_eq!(entries[0], from_scan[0]);
  }

  #[test]
  fn a_bootloader_device_carries_the_error_and_a_firmware_device_does_not() {
    let mut bootloader = firmware_device();
    bootloader.bootloader = true;
    let entries = device_entries(&[firmware_device(), bootloader]);
    assert!(entries[0].get("error").is_none());
    assert_eq!(entries[1]["error"], BOOTLOADER_MESSAGE);
    assert_eq!(entries[1]["code"], HWI_DEVICE_NOT_READY);
  }
}
