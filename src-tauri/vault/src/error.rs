/// What went wrong. Tests and callers can branch on it. The app shows the message.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorKind {
  /// No supported device is connected.
  DeviceNotFound,
  /// The device is in bootloader mode and has no running firmware.
  Bootloader,
  /// The device has no wallet on it yet.
  NotInitialized,
  /// The pairing between the app and the device failed or was rejected.
  PairingRejected,
  /// The user cancelled a prompt on the device.
  UserAbort,
  /// The firmware is too old for vault signing.
  FirmwareTooOld,
  /// The descriptor is not an unsorted `wsh(multi(...))` vault descriptor.
  UnsupportedDescriptor,
  /// The connected device holds none of the keys in the descriptor.
  KeyNotInVault,
  /// The device refuses to give the key at the path of the vault's key, so the wallet
  /// configuration and the network do not fit each other.
  ForbiddenKeyPath,
  /// The device already holds a different wallet under the names the app would register.
  PolicyNameTaken,
  /// The PSBT lacks data the device needs, or does not belong to this vault.
  InvalidPsbt,
  /// The device returned a PSBT for a different transaction.
  TransactionMismatch,
  /// The device returned a signature that does not verify.
  InvalidSignature,
  /// The USB or encrypted channel failed.
  Communication,
  /// A session with this kind of device is already running in this app.
  Busy,
  /// Anything else.
  Other,
}

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
