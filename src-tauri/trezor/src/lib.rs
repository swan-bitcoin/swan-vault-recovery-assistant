//! Trezor Safe 7 signing for Swan vault recovery.
//!
//! This crate has no dependency on the Tauri shell, so it builds and tests without a window
//! system. The app calls [`scan`] to find a device and [`sign_psbt_usb`] to sign. The session
//! itself, [`sign_psbt`], runs over any [`Transport`], so tests run it against a software device
//! and against Trezor's emulator.
//!
//! The modules, from the wire up. A module builds on the ones above it in this list.
//! - `transport`: packets in and out (the [`Transport`] trait), nothing else.
//! - `link`: the THP channel over a transport: handshake, acknowledgements, retransmission, and
//!   the deadlines that tell a silent device from a user who takes time.
//! - `device_error`: turns every link failure and every failure of the device into a message for
//!   the user. No text of the device reaches the user. The modules below it use it.
//! - `device`: typed requests and answers over a channel, button requests, and cancel.
//! - `pairing` and `cpace`: the code-entry pairing. `keys`: what SVRA asks the device (features,
//!   the key of the vault). `signing`: the `SignTx` conversation and the data it needs.
//! - `session`: one signing attempt, in order. This is [`sign_psbt`].
//! - `usb` (feature `usb`): finding the device, the lock that allows one session, and
//!   [`sign_psbt_usb`]. `pairing_codes`: the hand-over of the code from the window to the session.
//! - `proto`: the protobuf messages, written by hand. `test_device`: the software Safe 7 that the
//!   unit tests run against.

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
pub use usb::{
  after_scan, scan, session_running, sign_psbt_usb, AfterScan, DetectedDevice, BUSY_MESSAGE,
};

#[cfg(test)]
#[path = "../tests/support/mod.rs"]
mod test_support;

// The emulator tests need to load a seed into the device, which only the session code of this
// crate can do over THP. They skip when `TREZOR_EMULATOR` is not set.
#[cfg(test)]
#[path = "../tests/emulator.rs"]
mod emulator_tests;
