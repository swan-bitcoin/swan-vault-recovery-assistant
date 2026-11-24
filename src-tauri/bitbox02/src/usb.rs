use crate::device_error::{map_device_error, Step};
use crate::error::{Error, ErrorKind, BOOTLOADER_MESSAGE};
use crate::session::{sign_psbt, Progress, SignOutcome, SignRequest};
use bitbox_api::runtime::TokioRuntime;
use bitbox_api::{BitBox, NoiseConfigNoCache};
use hidapi::{DeviceInfo, HidApi, HidDevice};
use std::ffi::{CStr, CString};
use std::sync::{Mutex, MutexGuard, TryLockError};

/// USB vendor id of every BitBox02 (Microchip, the maker of its microcontroller).
const VENDOR_ID: u16 = 0x03eb;

/// USB product ids that a device in bootloader mode can have. Production devices use 0x2403, which
/// the firmware shares, and the vendor's Python library also accepts 0x2402 for some development
/// devices. The product string tells firmware and bootloader apart.
/// Source: `get_devices()` in `py/bitbox02/bitbox02/communication/devices.py` of the
/// `bitbox02-firmware` repository, tag `firmware/v9.27.0`.
const BOOTLOADER_PRODUCT_IDS: [u16; 2] = [0x2402, 0x2403];

/// Model names that HWI reports, with the USB product strings of the firmware and of the
/// bootloader. The firmware strings are the ones of `is_bitbox02` in `src/usb.rs` of `bitbox-api`
/// 0.13.0. The bootloader strings are the `BB02*_BOOTLOADER` and `BITBOX02PLUS_*_BOOTLOADER`
/// names in `py/bitbox02/bitbox02/communication/devices.py` of the `bitbox02-firmware`
/// repository, tag `firmware/v9.27.0`.
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

const NOT_FOUND_MESSAGE: &str = "No BitBox02 found. Connect the BitBox02. Close the BitBoxApp, because only one program can use the BitBox02 at a time. If the BitBox02 is connected, unplug it and plug it in again.";

/// Held for the whole of one device session. A second session on the same device would wait for
/// the first one without end, because the vendor library asks again each time the device answers
/// that it is busy.
static SESSION: Mutex<()> = Mutex::new(());

fn try_begin_session(lock: &Mutex<()>) -> Result<MutexGuard<'_, ()>, Error> {
  match lock.try_lock() {
    Ok(guard) => Ok(guard),
    // The lock guards no data, so a session that panicked leaves nothing broken behind.
    Err(TryLockError::Poisoned(poisoned)) => Ok(poisoned.into_inner()),
    Err(TryLockError::WouldBlock) => Err(Error::new(
      ErrorKind::Busy,
      "SVRA is still waiting for your BitBox02. Finish on the BitBox02, or unplug it to stop. Then try again.",
    )),
  }
}

/// The device was listed, but the operating system refused to open it.
fn open_error() -> Error {
  let mut message = String::from(
    "SVRA found the BitBox02 but cannot open it. Close the BitBoxApp, because only one program can use the BitBox02 at a time, then try again.",
  );
  // The packaged app has no README file, so the message carries the link.
  if cfg!(target_os = "linux") {
    message.push_str(
      " If the BitBoxApp is closed, your user may lack the right to open the device. Add the udev rule, then plug the BitBox02 in again. The steps are at https://github.com/swan-bitcoin/swan-vault-recovery-assistant#linux-allow-access-to-the-bitbox02",
    );
  }
  Error::new(ErrorKind::Communication, message)
}

/// Opens a device that the scan listed. A failure here is not a missing device, so it has its own
/// error.
fn open_device(api: &HidApi, path: &CStr) -> Result<HidDevice, Error> {
  api.open_path(path).map_err(|_| open_error())
}

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

/// The model of a HID entry that the scan accepts, and whether the device runs its bootloader.
/// `None` for any other entry.
fn classify(info: &DeviceInfo) -> Option<(&'static str, bool)> {
  let product_string = info.product_string()?;
  // The vendor test lists one device once, not once for each of its USB interfaces.
  if bitbox_api::usb::is_bitbox02(info) {
    Some((firmware_model(product_string)?, false))
  } else {
    let model = bootloader_model(
      info.vendor_id(),
      info.product_id(),
      info.usage_page(),
      info.interface_number(),
      product_string,
    )?;
    Some((model, true))
  }
}

fn find_devices(api: &HidApi) -> Vec<Found> {
  api
    .device_list()
    .filter_map(|info| {
      let (model, bootloader) = classify(info)?;
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

/// What the scan made of one HID entry with the BitBox02 vendor id.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Verdict {
  Firmware,
  Bootloader,
  NotAccepted,
}

/// The text of one entry of [`ScanReport::seen`], from the plain values of the HID entry.
fn seen_line(
  product_id: u16,
  product_string: Option<&str>,
  usage_page: u16,
  interface_number: i32,
  verdict: Verdict,
) -> String {
  let product = match product_string {
    Some(product_string) => format!("\"{product_string}\""),
    None => "no product string".to_string(),
  };
  let verdict = match verdict {
    Verdict::Firmware => "firmware",
    Verdict::Bootloader => "bootloader",
    Verdict::NotAccepted => "not accepted",
  };
  format!(
    "pid {product_id:04x} {product} usage {usage_page:04x} interface {interface_number}: {verdict}"
  )
}

/// The result of one USB scan, with what the scan saw. A caller that finds no device can show
/// [`ScanReport`] to say why.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScanReport {
  /// The devices that the scan accepts. This is what [`scan`] returns.
  pub devices: Vec<DetectedDevice>,
  /// One line for each HID entry with the BitBox02 vendor id, accepted or not.
  pub seen: Vec<String>,
  /// The number of all HID entries, with any vendor id.
  pub hid_entries: usize,
}

impl std::fmt::Display for ScanReport {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    write!(
      f,
      "{} HID entries; with the BitBox02 vendor id: ",
      self.hid_entries
    )?;
    if self.seen.is_empty() {
      write!(f, "none")
    } else {
      write!(f, "[{}]", self.seen.join("; "))
    }
  }
}

/// Lists the connected BitBox02 devices from their USB descriptors, and reports what the scan
/// saw. One USB enumeration fills both.
pub fn scan_report() -> Result<ScanReport, Error> {
  let api = HidApi::new().map_err(|_error| {
    // The message for the user does not carry the cause, so a debug build prints it.
    #[cfg(debug_assertions)]
    eprintln!("The HID library cannot list the USB devices: {_error}");
    list_error()
  })?;
  let mut report = ScanReport {
    devices: Vec::new(),
    seen: Vec::new(),
    hid_entries: 0,
  };
  for info in api.device_list() {
    report.hid_entries += 1;
    let accepted = classify(info);
    if let Some((model, bootloader)) = accepted {
      report.devices.push(DetectedDevice {
        model: model.to_string(),
        path: info.path().to_string_lossy().into_owned(),
        bootloader,
      });
    }
    if info.vendor_id() == VENDOR_ID {
      let verdict = match accepted {
        Some((_, false)) => Verdict::Firmware,
        Some((_, true)) => Verdict::Bootloader,
        None => Verdict::NotAccepted,
      };
      report.seen.push(seen_line(
        info.product_id(),
        info.product_string(),
        info.usage_page(),
        info.interface_number(),
        verdict,
      ));
    }
  }
  Ok(report)
}

fn list_error() -> Error {
  Error::new(
    ErrorKind::Communication,
    "SVRA cannot list the USB devices. Check that SVRA may access USB devices, then try again.",
  )
}

/// Lists the connected BitBox02 devices from their USB descriptors.
pub fn scan() -> Result<Vec<DetectedDevice>, Error> {
  Ok(scan_report()?.devices)
}

/// Picks the one device to use. Returns its index.
fn select_device(devices: &[DetectedDevice]) -> Result<usize, Error> {
  if devices.is_empty() {
    return Err(Error::new(ErrorKind::DeviceNotFound, NOT_FOUND_MESSAGE));
  }
  if devices.iter().any(|device| device.bootloader) {
    return Err(Error::new(ErrorKind::Bootloader, BOOTLOADER_MESSAGE));
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
/// and keep the whole call on that one thread. It returns [`ErrorKind::Busy`] when another call
/// is still running.
pub fn sign_psbt_usb(
  request: SignRequest<'_>,
  on_progress: &mut dyn FnMut(Progress),
) -> Result<SignOutcome, Error> {
  let _session = try_begin_session(&SESSION)?;
  on_progress(Progress::Connecting);

  let api = HidApi::new().map_err(|_| list_error())?;
  let mut found = find_devices(&api);
  let devices: Vec<DetectedDevice> = found.iter().map(|found| found.device.clone()).collect();
  let chosen = found.swap_remove(select_device(&devices)?);
  let hid_device = open_device(&api, &chosen.path)?;

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
    // SVRA must not write to disk (README, "Core Design Principles"), so there is no pairing cache
    // and the user confirms the pairing code on every run.
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
    assert!(error.message.contains("BitBoxApp"), "{}", error.message);
    assert!(!error.message.contains("unlock"), "{}", error.message);
  }

  #[test]
  fn a_firmware_entry_is_named_as_firmware() {
    assert_eq!(
      seen_line(
        0x2403,
        Some("BitBox02 Nova BTC-only"),
        0xffff,
        0,
        Verdict::Firmware
      ),
      "pid 2403 \"BitBox02 Nova BTC-only\" usage ffff interface 0: firmware"
    );
  }

  #[test]
  fn a_bootloader_entry_is_named_as_a_bootloader() {
    assert_eq!(
      seen_line(
        0x2403,
        Some("BitBox02 Nova BTC-only bl"),
        0xffff,
        0,
        Verdict::Bootloader
      ),
      "pid 2403 \"BitBox02 Nova BTC-only bl\" usage ffff interface 0: bootloader"
    );
  }

  #[test]
  fn an_entry_that_the_scan_does_not_accept_says_so() {
    // The U2F interface of the same device.
    assert_eq!(
      seen_line(
        0x2403,
        Some("BitBox02 Nova BTC-only"),
        0xf1d0,
        1,
        Verdict::NotAccepted
      ),
      "pid 2403 \"BitBox02 Nova BTC-only\" usage f1d0 interface 1: not accepted"
    );
  }

  #[test]
  fn an_entry_without_a_product_string_says_so() {
    assert_eq!(
      seen_line(0x2403, None, 0xffff, 0, Verdict::NotAccepted),
      "pid 2403 no product string usage ffff interface 0: not accepted"
    );
  }

  #[test]
  fn a_report_prints_the_count_and_the_entries_with_the_vendor_id() {
    let report = ScanReport {
      devices: vec![],
      seen: vec![
        "pid 2403 \"BitBox02 Nova BTC-only\" usage ffff interface 0: firmware".to_string(),
        "pid 2403 \"BitBox02 Nova BTC-only\" usage f1d0 interface 1: not accepted".to_string(),
      ],
      hid_entries: 12,
    };
    assert_eq!(
      report.to_string(),
      "12 HID entries; with the BitBox02 vendor id: [pid 2403 \"BitBox02 Nova BTC-only\" usage ffff interface 0: firmware; pid 2403 \"BitBox02 Nova BTC-only\" usage f1d0 interface 1: not accepted]"
    );
  }

  #[test]
  fn a_report_without_an_entry_with_the_vendor_id_says_none() {
    let report = ScanReport {
      devices: vec![],
      seen: vec![],
      hid_entries: 3,
    };
    assert_eq!(
      report.to_string(),
      "3 HID entries; with the BitBox02 vendor id: none"
    );
  }

  #[test]
  fn the_not_found_message_tells_the_user_to_plug_the_device_in_again() {
    let error = select_device(&[]).expect_err("no device");
    assert!(
      error.message.contains("unplug it and plug it in again"),
      "{}",
      error.message
    );
  }

  #[test]
  fn a_bootloader_device_is_reported_as_a_bootloader() {
    let error = select_device(&[device(true)]).expect_err("bootloader");
    assert_eq!(error.kind, ErrorKind::Bootloader);
    assert!(error.message.contains("bootloader"), "{}", error.message);
  }

  #[test]
  fn two_devices_are_refused() {
    let error = select_device(&[device(false), device(false)]).expect_err("two devices");
    assert_eq!(error.kind, ErrorKind::Other);
    assert!(
      error.message.contains("More than one BitBox02"),
      "{}",
      error.message
    );
  }

  #[test]
  fn one_firmware_device_is_chosen() {
    assert_eq!(select_device(&[device(false)]).ok(), Some(0));
  }

  #[test]
  fn a_second_session_is_refused_until_the_first_one_ends() {
    let lock = Mutex::new(());
    let first = try_begin_session(&lock).expect("the first session starts");
    let error = try_begin_session(&lock).expect_err("the second session is refused");
    assert_eq!(error.kind, ErrorKind::Busy);
    assert!(error.message.contains("unplug"), "{}", error.message);
    drop(first);
    assert!(try_begin_session(&lock).is_ok());
  }

  #[test]
  fn a_session_that_panicked_does_not_block_the_next_one() {
    let lock = Mutex::new(());
    let _ = std::thread::scope(|scope| {
      scope
        .spawn(|| {
          let _guard = lock.lock();
          panic!("the session panics while it holds the lock");
        })
        .join()
    });
    assert!(lock.is_poisoned());
    assert!(try_begin_session(&lock).is_ok());
  }

  #[test]
  fn sign_psbt_usb_refuses_to_start_while_a_session_runs() {
    let psbt = bitcoin::psbt::Psbt::from_unsigned_tx(bitcoin::Transaction {
      version: bitcoin::transaction::Version::TWO,
      lock_time: bitcoin::absolute::LockTime::ZERO,
      input: vec![],
      output: vec![],
    })
    .expect("an empty PSBT");
    let request = SignRequest {
      network: bitcoin::Network::Testnet,
      receive_descriptor: "",
      change_descriptor: None,
      psbt,
    };
    let mut events = 0;
    let running = try_begin_session(&SESSION).expect("no other test holds the session");
    let result = sign_psbt_usb(request, &mut |_| events += 1);
    drop(running);
    let error = match result {
      Ok(_) => panic!("a session started while another one was running"),
      Err(error) => error,
    };
    assert_eq!(error.kind, ErrorKind::Busy);
    assert_eq!(events, 0, "a refused session must not report progress");
  }

  #[test]
  fn a_device_that_cannot_be_opened_is_a_communication_error_and_not_a_missing_device() {
    // No device has this path, so the operating system refuses to open it, as it does for a
    // BitBox02 that the BitBoxApp holds or that the user may not open.
    let api = HidApi::new().expect("the HID library starts");
    let path = CString::new("/dev/svra-no-such-hidraw").expect("a path without a nul byte");
    let error = match open_device(&api, &path) {
      Ok(_) => panic!("a device that does not exist was opened"),
      Err(error) => error,
    };
    assert_eq!(error.kind, ErrorKind::Communication);
    assert!(error.message.contains("BitBoxApp"), "{}", error.message);
    assert_eq!(
      error.message.contains("udev"),
      cfg!(target_os = "linux"),
      "{}",
      error.message
    );
    // The frontend and the README agree on this anchor.
    assert_eq!(
      error
        .message
        .contains("#linux-allow-access-to-the-bitbox02"),
      cfg!(target_os = "linux"),
      "{}",
      error.message
    );
  }
}
