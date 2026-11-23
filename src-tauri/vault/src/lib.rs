//! What the device crates share: the error type, the Swan vault descriptor, and the checks on a
//! PSBT before and after a device signs it.
//!
//! The code here names the device in its messages. The device crate passes that name to
//! [`parse_vault`], for example "BitBox02", and the later checks take it from the [`Vault`].
//!
//! ```no_run
//! use bitcoin::bip32::Fingerprint;
//! use bitcoin::psbt::Psbt;
//! use svra_vault::{
//!   address_steps, already_signed, key_of_device, parse_vault, precheck, vault_witness_script,
//!   verify_signed, Error,
//! };
//!
//! fn sign(
//!   receive: &str,
//!   change: Option<&str>,
//!   fingerprint: Fingerprint,
//!   psbt: Psbt,
//!   signed_by_device: Psbt,
//! ) -> Result<(), Error> {
//!   let vault = parse_vault("Trezor Safe 7", receive, change)?.for_device(fingerprint)?;
//!   let our_keys = precheck(&psbt, fingerprint, &vault)?;
//!   if already_signed(&psbt, &our_keys, &vault) {
//!     return Ok(());
//!   }
//!   for (input, key) in psbt.inputs.iter().zip(&our_keys) {
//!     let (_, path) = &input.bip32_derivation[key];
//!     let steps = address_steps(&vault, path).expect("the pre-check passed");
//!     let _script = vault_witness_script(&vault, &steps);
//!   }
//!   for output in &psbt.outputs {
//!     if let Some((_, path)) = key_of_device(&output.bip32_derivation, fingerprint) {
//!       let _steps = address_steps(&vault, path);
//!     }
//!   }
//!   verify_signed(&psbt, &signed_by_device, &our_keys, &vault)
//! }
//! ```

mod descriptor;
mod error;
mod psbt_checks;

pub use descriptor::{parse_vault, ParsedVault, Vault, VaultKey};
pub use error::{Error, ErrorKind};
pub use psbt_checks::{
  address_steps, already_signed, key_of_device, precheck, vault_public_key, vault_witness_script,
  verify_signed,
};

#[cfg(test)]
#[path = "../tests/support/mod.rs"]
mod test_support;
