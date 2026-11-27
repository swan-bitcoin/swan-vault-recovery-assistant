pub use svra_vault::{Error, ErrorKind};

/// The message that tells the user about a BitBox02 in bootloader mode. The app shows the same
/// sentence when it lists devices.
pub const BOOTLOADER_MESSAGE: &str = "The BitBox02 is in bootloader mode, which is only for firmware updates, so it cannot sign. Unplug it and plug it in again. If it stays in this mode, install the firmware with the BitBoxApp. To sign with another device, unplug this BitBox02.";
