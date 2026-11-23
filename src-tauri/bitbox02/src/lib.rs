//! BitBox02 signing for Swan vault recovery.
//!
//! This crate has no dependency on the Tauri shell, so it builds and tests without a window
//! system. The app calls [`scan`] to find a device and [`sign_psbt_usb`] to sign.

mod device_error;
mod error;
mod policy;
mod session;
#[cfg(feature = "usb")]
mod usb;

pub use error::{Error, ErrorKind, BOOTLOADER_MESSAGE};
pub use policy::{build_policy, PolicyArtifact};
pub use session::{
  fallback_policy_name, sign_psbt, Progress, SignOutcome, SignRequest, MIN_FIRMWARE_VERSION,
  POLICY_NAME,
};
#[cfg(feature = "usb")]
pub use usb::{scan, sign_psbt_usb, DetectedDevice};

#[cfg(test)]
#[path = "../tests/support/mod.rs"]
mod test_support;
