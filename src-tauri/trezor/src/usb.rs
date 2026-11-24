//! The Safe 7 on USB.
//!
//! The Safe 7 has one USB interface, number 0, of the vendor class (the class that WebUSB uses),
//! with an interrupt endpoint in each direction: `0x81` in and `0x01` out. Each transfer is one
//! 64-byte packet. The numbers come from `python/src/trezorlib/transport/webusb.py` of the
//! firmware release 2.13.1 (`INTERFACE = 0`, `ENDPOINT = 1`).
//!
//! The crate uses `nusb`, which talks to the operating system directly (usbfs on Linux, IOKit on
//! macOS, WinUSB on Windows) and has no C library to build.

use crate::error::{Error, ErrorKind, BOOTLOADER_MESSAGE};
use crate::pairing_codes::PairingCodes;
use crate::session::{sign_psbt, SignOutcome, SignRequest, Ui};
use crate::transport::{Transport, TransportError, PACKET_LEN};
use nusb::transfer::{Buffer, In, Interrupt, Out, TransferError};
use nusb::{Device, DeviceInfo, Endpoint, Interface, MaybeFuture};
use std::sync::{Mutex, MutexGuard, TryLockError};
use std::time::{Duration, Instant};

/// The vendor id that Trezor devices share (pid.codes, the open source USB id registry).
const VENDOR_ID: u16 = 0x1209;
/// The product id of a Trezor that runs its firmware, and the one of a Trezor in its bootloader.
/// Every Trezor model that is newer than the Model One shares both ids, so the ids alone do not
/// tell the models apart.
const FIRMWARE_PRODUCT_ID: u16 = 0x53c1;
const BOOTLOADER_PRODUCT_ID: u16 = 0x53c0;
/// The USB strings of the Safe 7. They are the `MODEL_USB_MANUFACTURER` and `MODEL_USB_PRODUCT`
/// of `core/embed/models/T3W1/model_T3W1.h` in the firmware release 2.13.1. The firmware and the
/// bootloader report the same strings.
const MANUFACTURER_STRING: &str = "Trezor Company";
const PRODUCT_STRING: &str = "Trezor Safe 7";

const INTERFACE: u8 = 0;
const ENDPOINT_IN: u8 = 0x81;
const ENDPOINT_OUT: u8 = 0x01;
const WRITE_TIMEOUT: Duration = Duration::from_secs(2);

/// The model name in the list of devices. HWI reports the other models as `trezor`.
const MODEL: &str = "trezor_safe_7";

const NOT_FOUND_MESSAGE: &str = "No Trezor Safe 7 found. Connect the Trezor Safe 7. Close Trezor Suite, because only one program can use the Trezor Safe 7 at a time.";

/// Held for the whole of one device session. A second session on the same device would fight the
/// first one for the interface.
static SESSION: Mutex<()> = Mutex::new(());

/// How long a new session waits for the lock. A session that the user left behind needs a moment
/// to notice that it was cancelled and to let go of the device. A session that is really running
/// holds the lock for longer than this.
const SESSION_START_WAIT: Duration = Duration::from_secs(2);
const SESSION_START_STEP: Duration = Duration::from_millis(50);

/// What the user reads when a session holds the device.
pub const BUSY_MESSAGE: &str = "An earlier signing attempt still uses the Trezor Safe 7. Unplug the Trezor Safe 7, plug it in again, then try again.";

fn try_begin_session(lock: &Mutex<()>, wait: Duration) -> Result<MutexGuard<'_, ()>, Error> {
  let started = Instant::now();
  loop {
    match lock.try_lock() {
      Ok(guard) => return Ok(guard),
      // The lock guards no data, so a session that panicked leaves nothing broken behind.
      Err(TryLockError::Poisoned(poisoned)) => return Ok(poisoned.into_inner()),
      Err(TryLockError::WouldBlock) => {
        if started.elapsed() >= wait {
          return Err(Error::new(ErrorKind::Busy, BUSY_MESSAGE));
        }
        std::thread::sleep(SESSION_START_STEP);
      }
    }
  }
}

/// True while a session holds the device. The app does not ask HWI for devices then, because HWI
/// would send the old protocol to the Safe 7 that the session uses, and the operating system may
/// not list a device that a session has claimed.
pub fn session_running() -> bool {
  matches!(SESSION.try_lock(), Err(TryLockError::WouldBlock))
}

/// A Trezor Safe 7 found on USB. Finding it sends nothing to the device.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DetectedDevice {
  /// Always `trezor_safe_7`.
  pub model: String,
  /// Where the device is on the USB bus.
  pub path: String,
  /// True when the device runs its bootloader and not the firmware.
  pub bootloader: bool,
}

/// Tells a Safe 7 from every other USB device, by the descriptors that the device gives to the
/// operating system when it is plugged in. Returns `Some(true)` for a Safe 7 in its bootloader.
///
/// The Safe 7 is the only Trezor that speaks THP today. The Safe 3 (`T3B1`) reports "Trezor Safe
/// 3", the Safe 5 (`T3T1`) "Trezor Safe 5", and the Model T and the first Safe 3 (`T2T1`, `T2B1`)
/// report "TREZOR" with the manufacturer "SatoshiLabs". All of them have the vendor id and the
/// product ids above, so the product string decides. The manufacturer string is checked when the
/// system has it. Windows does not cache it.
fn classify(
  vendor_id: u16,
  product_id: u16,
  manufacturer: Option<&str>,
  product: Option<&str>,
) -> Option<bool> {
  if vendor_id != VENDOR_ID || product != Some(PRODUCT_STRING) {
    return None;
  }
  if manufacturer.is_some_and(|manufacturer| manufacturer != MANUFACTURER_STRING) {
    return None;
  }
  match product_id {
    FIRMWARE_PRODUCT_ID => Some(false),
    BOOTLOADER_PRODUCT_ID => Some(true),
    _ => None,
  }
}

/// The product string of a device. The system lists it for most devices. When it does not, the
/// descriptor is read from the device, which is part of how the system enumerates it.
fn product_string(info: &DeviceInfo) -> Option<String> {
  info
    .product_string()
    .map(str::to_string)
    .or_else(|| info.get_product_string().wait().ok().flatten())
}

fn list_error() -> Error {
  Error::new(
    ErrorKind::Communication,
    "SVRA cannot list the USB devices. Check that SVRA may access USB devices, then try again.",
  )
}

/// A device with the handle that opens it.
struct Found {
  device: DetectedDevice,
  info: DeviceInfo,
}

fn find_devices() -> Result<Vec<Found>, Error> {
  let devices = nusb::list_devices().wait().map_err(|_| list_error())?;
  Ok(
    devices
      // Only the Trezor ids are asked for their strings.
      .filter(|info| {
        info.vendor_id() == VENDOR_ID
          && matches!(
            info.product_id(),
            FIRMWARE_PRODUCT_ID | BOOTLOADER_PRODUCT_ID
          )
      })
      .filter_map(|info| {
        let product = product_string(&info);
        let bootloader = classify(
          info.vendor_id(),
          info.product_id(),
          info.manufacturer_string(),
          product.as_deref(),
        )?;
        Some(Found {
          device: DetectedDevice {
            model: MODEL.to_string(),
            path: format!("{}:{}", info.bus_id(), info.device_address()),
            bootloader,
          },
          info,
        })
      })
      .collect(),
  )
}

/// Lists the connected Trezor Safe 7 devices from their USB descriptors. Other Trezor models are
/// not listed, so that the hardware wallet tool keeps handling them.
pub fn scan() -> Result<Vec<DetectedDevice>, Error> {
  Ok(
    find_devices()?
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
    return Err(Error::new(ErrorKind::Bootloader, BOOTLOADER_MESSAGE));
  }
  if devices.len() > 1 {
    return Err(Error::new(
      ErrorKind::Other,
      "More than one Trezor Safe 7 is connected. Connect only the Trezor Safe 7 that holds your vault key, then try again.",
    ));
  }
  Ok(0)
}

/// The device was listed, but the operating system refused to open it or to give its interface to
/// SVRA. The usual cause is another program that holds the interface, such as Trezor Suite.
fn open_error(kind: nusb::ErrorKind) -> Error {
  let mut message = String::from(
    "SVRA found the Trezor Safe 7 but cannot open it. Close Trezor Suite, because only one program can use the Trezor Safe 7 at a time, then try again.",
  );
  if kind == nusb::ErrorKind::Disconnected {
    message = String::from("The Trezor Safe 7 was unplugged. Plug it in again and try again.");
  } else if cfg!(target_os = "linux") {
    // The packaged app has no README file, so the message carries the link.
    message.push_str(
      " If Trezor Suite is closed, your user may lack the right to open the device. Add the udev rule, then plug the Trezor Safe 7 in again. The steps are at https://github.com/swan-bitcoin/swan-vault-recovery-assistant#linux-allow-access-to-the-trezor-safe-7",
    );
  }
  Error::new(ErrorKind::Communication, message)
}

/// The packets of one open device.
struct UsbTransport {
  // The interface and the device stay open as long as the endpoints do.
  _device: Device,
  _interface: Interface,
  reader: Endpoint<Interrupt, In>,
  writer: Endpoint<Interrupt, Out>,
}

fn open_transport(info: &DeviceInfo) -> Result<UsbTransport, Error> {
  let device = info
    .open()
    .wait()
    .map_err(|error| open_error(error.kind()))?;
  let interface = device
    .claim_interface(INTERFACE)
    .wait()
    .map_err(|error| open_error(error.kind()))?;
  let reader = interface
    .endpoint::<Interrupt, In>(ENDPOINT_IN)
    .map_err(|error| open_error(error.kind()))?;
  let writer = interface
    .endpoint::<Interrupt, Out>(ENDPOINT_OUT)
    .map_err(|error| open_error(error.kind()))?;
  Ok(UsbTransport {
    _device: device,
    _interface: interface,
    reader,
    writer,
  })
}

fn transport_error(error: TransferError) -> TransportError {
  match error {
    TransferError::Disconnected => TransportError::Disconnected,
    _ => TransportError::Failed,
  }
}

impl Transport for UsbTransport {
  fn write_packet(&mut self, packet: &[u8]) -> Result<(), TransportError> {
    if packet.len() != PACKET_LEN {
      return Err(TransportError::Failed);
    }
    let mut buffer = Buffer::new(PACKET_LEN);
    buffer.extend_from_slice(packet);
    self
      .writer
      .transfer_blocking(buffer, WRITE_TIMEOUT)
      .into_result()
      .map(|_| ())
      .map_err(transport_error)
  }

  fn read_packet(&mut self, timeout: Duration) -> Result<Option<Vec<u8>>, TransportError> {
    // One read stays pending between calls, so that a packet that arrives while the session does
    // something else is not lost.
    if self.reader.pending() == 0 {
      self.reader.submit(Buffer::new(PACKET_LEN));
    }
    match self.reader.wait_next_complete(timeout) {
      None => Ok(None),
      Some(completion) => completion
        .into_result()
        .map(|buffer| Some(buffer[..].to_vec()))
        .map_err(transport_error),
    }
  }
}

/// Takes the lock of a new session. The app starts a run only when its page has no run open, so a
/// code wait that is still open belongs to a page that was reloaded or cleared, and its session
/// holds the device for nobody. The wait ends first, which makes that session let go, and then
/// the new session waits for the lock. This order is one function so that a test pins it.
fn begin_session<'a>(
  codes: &PairingCodes,
  lock: &'a Mutex<()>,
) -> Result<MutexGuard<'a, ()>, Error> {
  let _ = codes.cancel();
  try_begin_session(lock, SESSION_START_WAIT)
}

/// Opens the one connected Trezor Safe 7 and runs [`crate::sign_psbt`] on it.
///
/// `codes` is where the window hands over the pairing code. A code wait that is still open there
/// when this call starts is ended first. This call blocks until the user finishes on the device.
/// Call it from a thread that may block, and keep the whole call on that one thread. It returns
/// [`ErrorKind::Busy`] when another session is still running after a short wait for it to end.
pub fn sign_psbt_usb(
  codes: &PairingCodes,
  request: SignRequest<'_>,
  ui: &mut dyn Ui,
) -> Result<SignOutcome, Error> {
  sign_on_usb(codes, &SESSION, request, ui)
}

fn sign_on_usb(
  codes: &PairingCodes,
  lock: &Mutex<()>,
  request: SignRequest<'_>,
  ui: &mut dyn Ui,
) -> Result<SignOutcome, Error> {
  let _session = begin_session(codes, lock)?;
  let mut found = find_devices()?;
  let devices: Vec<DetectedDevice> = found.iter().map(|found| found.device.clone()).collect();
  let chosen = found.swap_remove(select_device(&devices)?);
  let transport = open_transport(&chosen.info)?;
  sign_psbt(transport, request, ui)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn device(bootloader: bool) -> DetectedDevice {
    DetectedDevice {
      model: MODEL.to_string(),
      path: "1:2".to_string(),
      bootloader,
    }
  }

  #[test]
  fn a_safe_7_is_told_by_its_strings() {
    let firmware = classify(
      0x1209,
      0x53c1,
      Some("Trezor Company"),
      Some("Trezor Safe 7"),
    );
    assert_eq!(firmware, Some(false));
    let bootloader = classify(
      0x1209,
      0x53c0,
      Some("Trezor Company"),
      Some("Trezor Safe 7"),
    );
    assert_eq!(bootloader, Some(true));
    // Windows has no manufacturer string.
    assert_eq!(
      classify(0x1209, 0x53c1, None, Some("Trezor Safe 7")),
      Some(false)
    );
  }

  #[test]
  fn the_other_trezor_models_are_not_listed() {
    // The strings that the firmware of each model reports, from `core/embed/models`.
    for (manufacturer, product) in [
      ("Trezor Company", "Trezor Safe 5"),
      ("Trezor Company", "Trezor Safe 3"),
      ("SatoshiLabs", "TREZOR"),
    ] {
      for product_id in [0x53c0, 0x53c1] {
        assert_eq!(
          classify(0x1209, product_id, Some(manufacturer), Some(product)),
          None,
          "{product} {product_id:#x}"
        );
      }
    }
  }

  #[test]
  fn a_device_that_is_not_a_safe_7_by_id_or_string_is_not_listed() {
    // Another vendor that happens to use the string.
    assert_eq!(classify(0x03eb, 0x53c1, None, Some("Trezor Safe 7")), None);
    // Another product id of the Trezor vendor id.
    assert_eq!(classify(0x1209, 0x53c2, None, Some("Trezor Safe 7")), None);
    assert_eq!(classify(0x1209, 0x0001, None, Some("Trezor Safe 7")), None);
    // No product string at all.
    assert_eq!(classify(0x1209, 0x53c1, Some("Trezor Company"), None), None);
    // The string of the Safe 7 with another manufacturer.
    assert_eq!(
      classify(0x1209, 0x53c1, Some("Other"), Some("Trezor Safe 7")),
      None
    );
    // A BitBox02.
    assert_eq!(classify(0x03eb, 0x2403, None, Some("BitBox02")), None);
  }

  #[test]
  fn no_device_is_not_found() {
    let error = select_device(&[]).expect_err("no device");
    assert_eq!(error.kind, ErrorKind::DeviceNotFound);
    assert!(error.message.contains("Trezor Suite"), "{}", error.message);
  }

  #[test]
  fn a_bootloader_device_is_reported_as_a_bootloader() {
    let error = select_device(&[device(true)]).expect_err("bootloader");
    assert_eq!(error.kind, ErrorKind::Bootloader);
    assert_eq!(error.message, BOOTLOADER_MESSAGE);
  }

  #[test]
  fn two_devices_are_refused() {
    let error = select_device(&[device(false), device(false)]).expect_err("two devices");
    assert_eq!(error.kind, ErrorKind::Other);
    assert!(error.message.contains("More than one"), "{}", error.message);
  }

  #[test]
  fn one_firmware_device_is_chosen() {
    assert_eq!(select_device(&[device(false)]).ok(), Some(0));
  }

  const NO_WAIT: Duration = Duration::ZERO;

  #[test]
  fn a_second_session_is_refused_until_the_first_one_ends() {
    let lock = Mutex::new(());
    let first = try_begin_session(&lock, NO_WAIT).expect("the first session starts");
    let error = try_begin_session(&lock, NO_WAIT).expect_err("the second session is refused");
    assert_eq!(error.kind, ErrorKind::Busy);
    assert!(error.message.contains("Unplug"), "{}", error.message);
    drop(first);
    assert!(try_begin_session(&lock, NO_WAIT).is_ok());
  }

  #[test]
  fn a_new_session_waits_for_a_session_that_is_about_to_end() {
    let lock = Mutex::new(());
    std::thread::scope(|scope| {
      let (held, is_held) = std::sync::mpsc::channel();
      let lock = &lock;
      scope.spawn(move || {
        let first = try_begin_session(lock, NO_WAIT).expect("the first session starts");
        held.send(()).expect("the test listens");
        std::thread::sleep(Duration::from_millis(150));
        drop(first);
      });
      is_held.recv().expect("the first session holds the lock");
      let started = Instant::now();
      let second = try_begin_session(lock, Duration::from_secs(5))
        .expect("the second session gets the lock when the first one ends");
      assert!(started.elapsed() >= Duration::from_millis(50));
      drop(second);
    });
  }

  #[test]
  fn a_new_session_does_not_wait_longer_than_its_limit_for_a_running_one() {
    let lock = Mutex::new(());
    let _first = try_begin_session(&lock, NO_WAIT).expect("the first session starts");
    let started = Instant::now();
    let error = try_begin_session(&lock, Duration::from_millis(120))
      .expect_err("the first session still runs");
    assert_eq!(error.kind, ErrorKind::Busy);
    assert!(started.elapsed() >= Duration::from_millis(120));
    assert!(started.elapsed() < Duration::from_secs(5));
  }

  #[test]
  fn a_new_session_ends_the_code_wait_of_an_old_one_and_waits_for_its_lock() {
    let codes = PairingCodes::new();
    let lock = Mutex::new(());
    std::thread::scope(|scope| {
      let (held, is_held) = std::sync::mpsc::channel();
      let (codes, lock) = (&codes, &lock);
      // The old session of a page that was reloaded: it holds the device and waits for a code
      // that nobody will type. It lets go a moment after its wait ends, as a session does.
      scope.spawn(move || {
        let session = try_begin_session(lock, NO_WAIT).expect("the old session starts");
        let wait = codes.begin("main");
        held.send(()).expect("the test listens");
        for _ in 0..50 {
          if wait.poll(Duration::from_millis(100)) == crate::session::CodeEntry::Cancelled {
            break;
          }
        }
        std::thread::sleep(Duration::from_millis(300));
        drop(session);
      });
      is_held.recv().expect("the old session holds the lock");
      let started = Instant::now();
      // Without the cancel the old session waits for five seconds. Without the wait for the lock
      // this call is refused at once.
      let session = begin_session(codes, lock).expect("the new session gets the lock");
      assert!(started.elapsed() >= Duration::from_millis(250));
      assert!(started.elapsed() < SESSION_START_WAIT);
      drop(session);
    });
  }

  #[test]
  fn a_new_session_is_refused_after_its_wait_when_the_old_one_runs_on() {
    let codes = PairingCodes::new();
    let lock = Mutex::new(());
    let _running = try_begin_session(&lock, NO_WAIT).expect("the old session starts");
    let started = Instant::now();
    let error = begin_session(&codes, &lock).expect_err("the old session still runs");
    assert_eq!(error.kind, ErrorKind::Busy);
    assert!(started.elapsed() >= SESSION_START_WAIT);
  }

  #[test]
  fn a_new_session_starts_at_once_when_nothing_runs() {
    let codes = PairingCodes::new();
    let lock = Mutex::new(());
    let started = Instant::now();
    assert!(begin_session(&codes, &lock).is_ok());
    assert!(started.elapsed() < Duration::from_millis(500));
  }

  #[test]
  fn a_running_session_is_reported() {
    // Only this test touches the real lock, and it never holds it across a call to a device.
    assert!(!session_running());
    let guard = try_begin_session(&SESSION, NO_WAIT).expect("no other test holds the session");
    assert!(session_running());
    drop(guard);
    assert!(!session_running());
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
    assert!(try_begin_session(&lock, NO_WAIT).is_ok());
  }

  struct SilentUi(usize);

  impl Ui for SilentUi {
    fn progress(&mut self, _: crate::session::Progress) {
      self.0 += 1;
    }

    fn pairing_code(&mut self, _: Duration) -> crate::session::CodeEntry {
      crate::session::CodeEntry::Cancelled
    }
  }

  #[test]
  fn a_session_is_refused_to_start_while_another_runs() {
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
    let mut ui = SilentUi(0);
    let lock = Mutex::new(());
    let running = try_begin_session(&lock, NO_WAIT).expect("the lock is free");
    let result = sign_on_usb(&PairingCodes::new(), &lock, request, &mut ui);
    drop(running);
    let error = match result {
      Ok(_) => panic!("a session started while another one was running"),
      Err(error) => error,
    };
    assert_eq!(error.kind, ErrorKind::Busy);
    assert_eq!(ui.0, 0, "a refused session must not report progress");
  }

  #[test]
  fn an_interface_that_another_program_holds_asks_to_close_trezor_suite() {
    for kind in [nusb::ErrorKind::Busy, nusb::ErrorKind::PermissionDenied] {
      let error = open_error(kind);
      assert_eq!(error.kind, ErrorKind::Communication);
      assert!(error.message.contains("Trezor Suite"), "{}", error.message);
      // The frontend and the README agree on this anchor.
      assert_eq!(
        error
          .message
          .contains("#linux-allow-access-to-the-trezor-safe-7"),
        cfg!(target_os = "linux"),
        "{}",
        error.message
      );
    }
  }

  #[test]
  fn an_unplugged_device_is_not_a_permission_problem() {
    let error = open_error(nusb::ErrorKind::Disconnected);
    assert!(error.message.contains("unplugged"), "{}", error.message);
    assert!(!error.message.contains("udev"), "{}", error.message);
  }

  #[test]
  fn a_failed_transfer_is_a_disconnect_only_when_the_device_went_away() {
    assert_eq!(
      transport_error(TransferError::Disconnected),
      TransportError::Disconnected
    );
    assert_eq!(
      transport_error(TransferError::Stall),
      TransportError::Failed
    );
    assert_eq!(
      transport_error(TransferError::Fault),
      TransportError::Failed
    );
  }
}
