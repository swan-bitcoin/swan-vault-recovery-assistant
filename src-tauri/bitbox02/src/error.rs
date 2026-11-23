/// What went wrong, in a form the app can branch on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorKind {
  /// No BitBox02 is connected, or another program (the BitBoxApp) holds it.
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
  /// The device already holds a different vault under [`crate::POLICY_NAME`].
  PolicyNameTaken,
  /// The PSBT lacks data the device needs, or does not belong to this vault.
  InvalidPsbt,
  /// The device returned a PSBT for a different transaction.
  TransactionMismatch,
  /// The device returned a signature that does not verify.
  InvalidSignature,
  /// The USB or encrypted channel failed.
  Communication,
  /// Anything else.
  Other,
}

impl ErrorKind {
  /// A stable kebab-case code for the app, for example `user-abort`.
  pub fn code(&self) -> &'static str {
    match self {
      ErrorKind::DeviceNotFound => "device-not-found",
      ErrorKind::Bootloader => "bootloader",
      ErrorKind::NotInitialized => "not-initialized",
      ErrorKind::PairingRejected => "pairing-rejected",
      ErrorKind::UserAbort => "user-abort",
      ErrorKind::FirmwareTooOld => "firmware-too-old",
      ErrorKind::UnsupportedDescriptor => "unsupported-descriptor",
      ErrorKind::KeyNotInVault => "key-not-in-vault",
      ErrorKind::PolicyNameTaken => "policy-name-taken",
      ErrorKind::InvalidPsbt => "invalid-psbt",
      ErrorKind::TransactionMismatch => "transaction-mismatch",
      ErrorKind::InvalidSignature => "invalid-signature",
      ErrorKind::Communication => "communication",
      ErrorKind::Other => "other",
    }
  }
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
