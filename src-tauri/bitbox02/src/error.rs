/// What went wrong. Tests and callers can branch on it. The app shows the message.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorKind {
  /// No BitBox02 is connected.
  DeviceNotFound,
  /// The device is in bootloader mode and has no running firmware.
  Bootloader,
  /// The device has no wallet on it yet.
  NotInitialized,
  /// The user rejected the pairing code on the device.
  PairingRejected,
  /// The user cancelled a prompt on the device.
  UserAbort,
  /// The firmware is older than [`crate::MIN_FIRMWARE_VERSION`].
  FirmwareTooOld,
  /// The descriptor is not an unsorted `wsh(multi(...))` vault descriptor.
  UnsupportedDescriptor,
  /// The connected device holds none of the keys in the descriptor.
  KeyNotInVault,
  /// The device already holds a different wallet under [`crate::POLICY_NAME`] and under the
  /// fallback name of this vault.
  PolicyNameTaken,
  /// The PSBT lacks data the device needs, or does not belong to this vault.
  InvalidPsbt,
  /// The device returned a PSBT for a different transaction.
  TransactionMismatch,
  /// The device returned a signature that does not verify.
  InvalidSignature,
  /// The USB or encrypted channel failed.
  Communication,
  /// A BitBox02 session is already running in this app.
  Busy,
  /// Anything else.
  Other,
}

/// The message that tells the user about a BitBox02 in bootloader mode. The app shows the same
/// sentence when it lists devices.
pub const BOOTLOADER_MESSAGE: &str = "The BitBox02 is in bootloader mode, which is only for firmware updates, so it cannot sign. Unplug it and plug it in again. If it stays in this mode, install the firmware with the BitBoxApp. To sign with another device, unplug this BitBox02.";

/// An error with a message that is safe to show to the user as it is.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Error {
  pub kind: ErrorKind,
  pub message: String,
}

impl Error {
  pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
    Error {
      kind,
      message: message.into(),
    }
  }
}

impl std::fmt::Display for Error {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    write!(f, "{}", self.message)
  }
}

impl std::error::Error for Error {}
