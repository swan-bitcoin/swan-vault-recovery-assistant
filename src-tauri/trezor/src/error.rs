pub use svra_vault::{Error, ErrorKind};

/// The message that tells the user about a Trezor Safe 7 in bootloader mode. The app shows the
/// same sentence when it lists devices.
pub const BOOTLOADER_MESSAGE: &str = "The Trezor Safe 7 is in bootloader mode, which is only for firmware updates, so it cannot sign. Unplug it and plug it in again. If it stays in this mode, install the firmware with Trezor Suite. To sign with another device, unplug this Trezor Safe 7.";

/// The message for a Trezor that is not a Safe 7. Two places find this out: the properties that the
/// device sends before the handshake, and its features.
pub(crate) const NOT_A_SAFE_7_MESSAGE: &str = "The connected Trezor is not a Trezor Safe 7. SVRA signs with a Trezor Safe 7 in this way. Other Trezor models work through the hardware wallet tool, so unplug this one and connect a Trezor Safe 7, or use that tool.";

/// The message for a device that holds no wallet. Two places find this out: the features, and the
/// failure that the device sends when it has no seed.
pub(crate) const NO_WALLET_MESSAGE: &str = "This Trezor Safe 7 has no wallet yet. Set it up or restore it in Trezor Suite first, then try again.";
