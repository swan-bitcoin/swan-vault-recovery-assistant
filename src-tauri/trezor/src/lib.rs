//! Trezor Safe 7 signing for Swan vault recovery.
//!
//! This crate has no dependency on the Tauri shell, so it builds and tests without a window
//! system. The app calls [`scan`] to find a device and [`sign_psbt_usb`] to sign. The session
//! itself, [`sign_psbt`], runs over any [`Transport`], so tests run it against a software device
//! and against Trezor's emulator.

mod cpace;
mod device;
mod device_error;
mod error;
mod keys;
mod link;
mod pairing;
mod pairing_codes;
mod proto;
mod session;
mod signing;
mod transport;
#[cfg(feature = "usb")]
mod usb;

#[cfg(test)]
mod test_device;

pub use error::{Error, ErrorKind, BOOTLOADER_MESSAGE};
pub use pairing_codes::{NotWaiting, PairingCodes, Wait};
pub use session::{
  sign_psbt, CodeEntry, Progress, SignOutcome, SignRequest, Ui, MIN_FIRMWARE_VERSION,
};
pub use transport::{Transport, TransportError, PACKET_LEN};
#[cfg(feature = "usb")]
pub use usb::{scan, session_running, sign_psbt_usb, DetectedDevice, BUSY_MESSAGE};

#[cfg(test)]
#[path = "../tests/support/mod.rs"]
mod test_support;

// The emulator tests need to load a seed into the device, which only the session code of this
// crate can do over THP. They skip when `TREZOR_EMULATOR` is not set.
#[cfg(test)]
#[path = "../tests/emulator.rs"]
mod emulator_tests;
