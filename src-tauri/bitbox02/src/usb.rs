use crate::device_error::{map_device_error, Step};
use crate::error::{Error, ErrorKind};
use crate::session::{sign_psbt, Progress, SignOutcome, SignRequest};
use bitbox_api::runtime::TokioRuntime;
use bitbox_api::{BitBox, NoiseConfigNoCache};
use hidapi::HidApi;
use std::ffi::CString;

/// USB vendor id of every BitBox02 (Microchip, the maker of its microcontroller).
const VENDOR_ID: u16 = 0x03eb;

/// USB product ids of a bootloader. Production devices use 0x2403, and the vendor's Python
/// library also accepts 0x2402 for some development devices.
/// Source: `py/bitbox02/bitbox02/communication/devices.py` in the vendor's firmware repository,
/// `get_devices()` (lines 52-55).
const BOOTLOADER_PRODUCT_IDS: [u16; 2] = [0x2402, 0x2403];

/// Model names that HWI reports, with the USB product strings of the firmware and of the
/// bootloader. The firmware strings are the ones of `bitbox_api::usb::is_bitbox02`.
/// The bootloader strings come from the same file as above, `devices.py` lines 13-19
/// (`BB02MULTI_BOOTLOADER`, `BB02BTC_BOOTLOADER`, `BITBOX02PLUS_MULTI_BOOTLOADER`,
/// `BITBOX02PLUS_BTC_BOOTLOADER`), and from `PRODUCT_STRING_BITBOX02_*` in `src/bootloader.rs`
/// (lines 55-59) of the Swan `bitbox-api-rs` checkout.
const MODELS: [(&str, &str, &str); 4] = [
  ("bitbox02_multi", "BitBox02", "bb02-bootloader"),
  ("bitbox02_btconly", "BitBox02BTC", "bb02btc-bootloader"),
  (
    "bitbox02_nova_multi",
    "BitBox02 Nova Multi",
    "BitBox02 Nova Multi bl",
  ),
  (
    "bitbox02_nova_btconly",
    "BitBox02 Nova BTC-only",
    "BitBox02 Nova BTC-only bl",
  ),
];

const NOT_FOUND_MESSAGE: &str = "No BitBox02 found. Connect the BitBox02 and unlock it. Close the BitBoxApp, because only one program can use the BitBox02 at a time.";

/// A BitBox02 found on USB. Finding it does not talk to the device.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DetectedDevice {
  /// `bitbox02_multi`, `bitbox02_btconly`, `bitbox02_nova_multi` or `bitbox02_nova_btconly`.
  /// These are the model names HWI reports.
  pub model: String,
  /// The HID path.
  pub path: String,
  /// True when the device runs its bootloader and not the firmware.
  pub bootloader: bool,
}

/// A device with the HID path in the form that the HID library opens.
struct Found {
  device: DetectedDevice,
  path: CString,
}

/// The model of a device that runs the firmware, from its USB product string.
fn firmware_model(product_string: &str) -> Option<&'static str> {
  MODELS
    .iter()
    .find(|(_, firmware, _)| *firmware == product_string)
    .map(|(model, _, _)| *model)
}

/// The model of a device that runs its bootloader, from its USB descriptor. `None` for any other
/// device. The interface test is the one that the vendor library applies to the firmware.
fn bootloader_model(
  vendor_id: u16,
  product_id: u16,
  usage_page: u16,
  interface_number: i32,
  product_string: &str,
) -> Option<&'static str> {
  let is_bootloader_endpoint = vendor_id == VENDOR_ID
    && BOOTLOADER_PRODUCT_IDS.contains(&product_id)
    && (usage_page == 0xffff || interface_number == 0);
  if !is_bootloader_endpoint {
    return None;
  }
  MODELS
    .iter()
    .find(|(_, _, bootloader)| *bootloader == product_string)
    .map(|(model, _, _)| *model)
}

fn find_devices(api: &HidApi) -> Vec<Found> {
  api
    .device_list()
    .filter_map(|info| {
      let product_string = info.product_string()?;
      // The vendor test lists one device once, not once for each of its USB interfaces.
      let (model, bootloader) = if bitbox_api::usb::is_bitbox02(info) {
        (firmware_model(product_string)?, false)
      } else {
        let model = bootloader_model(
          info.vendor_id(),
          info.product_id(),
          info.usage_page(),
          info.interface_number(),
          product_string,
        )?;
        (model, true)
      };
      Some(Found {
        device: DetectedDevice {
          model: model.to_string(),
          path: info.path().to_string_lossy().into_owned(),
          bootloader,
        },
        path: info.path().to_owned(),
      })
    })
    .collect()
}

fn list_error() -> Error {
  Error::new(
    ErrorKind::Communication,
    "SVRA cannot list the USB devices. Check that SVRA may access USB devices, then try again.",
  )
}

/// Lists the connected BitBox02 devices from their USB descriptors.
pub fn scan() -> Result<Vec<DetectedDevice>, Error> {
  let api = HidApi::new().map_err(|_| list_error())?;
  Ok(
    find_devices(&api)
      .into_iter()
      .map(|found| found.device)
      .collect(),
  )
}

/// Picks the one device to use. Returns its index.
fn select_device(devices: &[DetectedDevice]) -> Result<usize, Error> {
  if devices.is_empty() {
    return Err(Error::new(ErrorKind::DeviceNotFound, NOT_FOUND_MESSAGE));
  }
  if devices.iter().any(|device| device.bootloader) {
    return Err(Error::new(
      ErrorKind::Bootloader,
      "The BitBox02 is in bootloader mode and has no firmware running. Unplug it and plug it in again to start it normally, or install the firmware with the BitBoxApp.",
    ));
  }
  if devices.len() > 1 {
    return Err(Error::new(
      ErrorKind::Other,
      "More than one BitBox02 is connected. Connect only the BitBox02 that holds your vault key, then try again.",
    ));
  }
  Ok(0)
}

/// Opens the one connected BitBox02 and runs [`crate::sign_psbt`] on it.
///
/// This call blocks until the user finishes on the device. Call it from a thread that may block,
/// and keep the whole call on that one thread.
pub fn sign_psbt_usb(
  request: SignRequest<'_>,
  on_progress: &mut dyn FnMut(Progress),
) -> Result<SignOutcome, Error> {
  on_progress(Progress::Connecting);

  let api = HidApi::new().map_err(|_| list_error())?;
  let mut found = find_devices(&api);
  let devices: Vec<DetectedDevice> = found.iter().map(|found| found.device.clone()).collect();
  let chosen = found.swap_remove(select_device(&devices)?);
  let hid_device = api
    .open_path(&chosen.path)
    .map_err(|_| Error::new(ErrorKind::DeviceNotFound, NOT_FOUND_MESSAGE))?;

  // One thread runs the device library, the HID reads and the progress callback. The device
  // library sleeps through the runtime, so the time driver must be on.
  let runtime = tokio::runtime::Builder::new_current_thread()
    .enable_time()
    .build()
    .map_err(|_| {
      Error::new(
        ErrorKind::Other,
        "SVRA cannot start the task that talks to the BitBox02. Restart SVRA and try again.",
      )
    })?;
  runtime.block_on(async move {
    let bitbox =
      BitBox::<TokioRuntime>::from_hid_device(hid_device, Box::new(NoiseConfigNoCache {}))
        .await
        .map_err(|error| map_device_error(error, Step::Connect))?;
    sign_psbt(bitbox, request, on_progress).await
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  fn device(bootloader: bool) -> DetectedDevice {
    DetectedDevice {
      model: "bitbox02_nova_btconly".to_string(),
      path: "path".to_string(),
      bootloader,
    }
  }

  #[test]
  fn each_firmware_product_string_has_a_model() {
    assert_eq!(firmware_model("BitBox02"), Some("bitbox02_multi"));
    assert_eq!(firmware_model("BitBox02BTC"), Some("bitbox02_btconly"));
    assert_eq!(
      firmware_model("BitBox02 Nova Multi"),
      Some("bitbox02_nova_multi")
    );
    assert_eq!(
      firmware_model("BitBox02 Nova BTC-only"),
      Some("bitbox02_nova_btconly")
    );
    assert_eq!(firmware_model("Jade"), None);
  }

  #[test]
  fn a_firmware_string_is_not_a_bootloader() {
    assert_eq!(
      bootloader_model(0x03eb, 0x2403, 0xffff, 0, "BitBox02 Nova BTC-only"),
      None
    );
  }

  #[test]
  fn each_bootloader_product_string_has_a_model() {
    let model = |product_string| bootloader_model(0x03eb, 0x2403, 0xffff, 0, product_string);
    assert_eq!(model("bb02-bootloader"), Some("bitbox02_multi"));
    assert_eq!(model("bb02btc-bootloader"), Some("bitbox02_btconly"));
    assert_eq!(model("BitBox02 Nova Multi bl"), Some("bitbox02_nova_multi"));
    assert_eq!(
      model("BitBox02 Nova BTC-only bl"),
      Some("bitbox02_nova_btconly")
    );
  }

  #[test]
  fn a_bootloader_needs_the_vendor_id_a_product_id_and_the_hww_interface() {
    let string = "BitBox02 Nova BTC-only bl";
    assert!(bootloader_model(0x03eb, 0x2402, 0xffff, 0, string).is_some());
    assert!(bootloader_model(0x03eb, 0x2403, 0, 0, string).is_some());
    assert!(bootloader_model(0x03eb, 0x2403, 0xffff, -1, string).is_some());
    assert!(bootloader_model(0x1234, 0x2403, 0xffff, 0, string).is_none());
    assert!(bootloader_model(0x03eb, 0x2404, 0xffff, 0, string).is_none());
    // The U2F interface of the same device.
    assert!(bootloader_model(0x03eb, 0x2403, 0, 1, string).is_none());
  }

  #[test]
  fn no_device_is_not_found() {
    let error = select_device(&[]).expect_err("no device");
    assert_eq!(error.kind, ErrorKind::DeviceNotFound);
    assert!(error.message.contains("BitBoxApp"));
  }

  #[test]
  fn a_bootloader_device_is_reported_as_a_bootloader() {
    let error = select_device(&[device(true)]).expect_err("bootloader");
    assert_eq!(error.kind, ErrorKind::Bootloader);
  }

  #[test]
  fn two_devices_are_refused() {
    let error = select_device(&[device(false), device(false)]).expect_err("two devices");
    assert_eq!(error.kind, ErrorKind::Other);
    assert!(error.message.contains("only"), "{}", error.message);
  }

  #[test]
  fn one_firmware_device_is_chosen() {
    assert_eq!(select_device(&[device(false)]).ok(), Some(0));
  }
}
