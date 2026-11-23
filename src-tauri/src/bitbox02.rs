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
/// when there is no device or the scan fails, so that a failed scan hides neither a Trezor Safe 7
/// nor the devices that HWI finds.
pub async fn enumerate() -> Vec<serde_json::Value> {
  match tokio::task::spawn_blocking(svra_bitbox02::scan).await {
    Ok(Ok(devices)) => device_entries(&devices),
    _ => Vec::new(),
  }
}

fn device_entries(devices: &[DetectedDevice]) -> Vec<serde_json::Value> {
  devices
    .iter()
    .map(|device| {
      let mut entry = json!({
        "type": "bitbox02",
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
