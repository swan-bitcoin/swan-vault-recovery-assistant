//! What SVRA asks the device before it signs: who the device is, and whether it holds a key of
//! the vault.

use crate::device::Device;
use crate::device_error::{unexpected_message, Step};
use crate::error::{Error, ErrorKind, BOOTLOADER_MESSAGE};
use crate::link::{QUICK, USER};
use crate::pairing::MANAGEMENT_SESSION;
use crate::proto::{
  Features, GetFeatures, GetPublicKey, InputScriptType, PublicKey, Success, ThpCreateNewSession,
};
use crate::session::{SignRequest, MIN_FIRMWARE_VERSION};
use crate::transport::Transport;
use bitcoin::bip32::{ChildNumber, DerivationPath, Fingerprint, Xpub};
use bitcoin::{Network, NetworkKind};
use std::str::FromStr;
use svra_vault::{parse_vault, Vault};

/// The model name that the Safe 7 reports.
pub(crate) const SAFE_7_MODEL: &str = "T3W1";

/// The name of the device in the messages about the vault.
pub(crate) const DEVICE_NAME: &str = "Trezor Safe 7";

/// The coin that the device is asked about. The firmware has its own coin for testnet and for
/// regtest, and testnet4 and signet share the testnet coin.
pub(crate) fn coin_name(network: Network) -> Result<&'static str, Error> {
  match network {
    Network::Bitcoin => Ok("Bitcoin"),
    Network::Testnet | Network::Testnet4 | Network::Signet => Ok("Testnet"),
    Network::Regtest => Ok("Regtest"),
    other => Err(Error::new(
      ErrorKind::Other,
      format!("The Trezor Safe 7 does not support the {other} network."),
    )),
  }
}

/// The path of the account key of a Swan vault device: `m/48'/<coin type>'/0'/2'`. The coin type
/// is 0 on mainnet and 1 on every other network.
pub(crate) fn account_path(network: Network) -> DerivationPath {
  let coin_type = if NetworkKind::from(network) == NetworkKind::Main {
    0
  } else {
    1
  };
  DerivationPath::from(vec![
    ChildNumber::Hardened { index: 48 },
    ChildNumber::Hardened { index: coin_type },
    ChildNumber::Hardened { index: 0 },
    ChildNumber::Hardened { index: 2 },
  ])
}

pub(crate) fn path_numbers(path: &DerivationPath) -> Vec<u32> {
  path.as_ref().iter().map(|step| u32::from(*step)).collect()
}

/// Checks what the device reports about itself.
pub(crate) fn check_features(features: &Features) -> Result<(), Error> {
  if features.internal_model.as_deref() != Some(SAFE_7_MODEL) {
    return Err(Error::new(
      ErrorKind::Other,
      "The connected Trezor is not a Trezor Safe 7. SVRA signs with a Trezor Safe 7 in this way. Other Trezor models work through the hardware wallet tool, so unplug this one and connect a Trezor Safe 7, or use that tool.",
    ));
  }
  if features.bootloader_mode == Some(true) || features.firmware_present == Some(false) {
    return Err(Error::new(ErrorKind::Bootloader, BOOTLOADER_MESSAGE));
  }
  let version = semver::Version::new(
    u64::from(features.major_version),
    u64::from(features.minor_version),
    u64::from(features.patch_version),
  );
  if version < MIN_FIRMWARE_VERSION {
    return Err(Error::new(
      ErrorKind::FirmwareTooOld,
      format!(
        "This Trezor Safe 7 runs firmware {version}. Signing a Swan vault needs firmware {MIN_FIRMWARE_VERSION} or newer. Update the firmware in Trezor Suite, then try again."
      ),
    ));
  }
  if features.initialized != Some(true) {
    return Err(Error::new(
      ErrorKind::NotInitialized,
      "This Trezor Safe 7 has no wallet yet. Set it up or restore it in Trezor Suite first, then try again.",
    ));
  }
  Ok(())
}

/// True when two extended keys are the same key. The network is not compared: a testnet vault
/// writes `tpub` keys, and the device may report either prefix.
fn same_key(left: &Xpub, right: &Xpub) -> bool {
  left.depth == right.depth
    && left.parent_fingerprint == right.parent_fingerprint
    && left.child_number == right.child_number
    && left.public_key == right.public_key
    && left.chain_code == right.chain_code
}

/// The device's key in a vault.
pub(crate) struct Matched {
  pub vault: Vault,
  pub fingerprint: Fingerprint,
}

impl<X: Transport> Device<'_, X> {
  pub(crate) fn features(&mut self) -> Result<Features, Error> {
    self.call(
      MANAGEMENT_SESSION,
      &GetFeatures {},
      QUICK,
      Step::Query,
      None,
    )
  }

  /// Creates a wallet session. With `on_device` the device asks the user for the passphrase on
  /// its own screen. Without it the passphrase is empty, which is the standard wallet.
  pub(crate) fn create_session(&mut self, session: u8, on_device: bool) -> Result<(), Error> {
    let (step, patience) = if on_device {
      (Step::Passphrase, USER)
    } else {
      // The device asks for the PIN here if it locked itself since the handshake.
      (Step::Query, USER)
    };
    let _: Success = self.call(
      session,
      &ThpCreateNewSession {
        passphrase: None,
        on_device: on_device.then_some(true),
        derive_cardano: None,
      },
      patience,
      step,
      None,
    )?;
    Ok(())
  }

  /// The root fingerprint of the wallet of `session` and its extended key at `path`.
  fn public_key(
    &mut self,
    session: u8,
    path: &DerivationPath,
    coin: &str,
  ) -> Result<(Fingerprint, Xpub), Error> {
    let reply: PublicKey = self.call(
      session,
      &GetPublicKey {
        address_n: path_numbers(path),
        show_display: Some(false),
        coin_name: Some(coin.to_string()),
        script_type: Some(InputScriptType::SpendWitness as i32),
        ignore_xpub_magic: Some(true),
      },
      QUICK,
      Step::Query,
      None,
    )?;
    let root = reply.root_fingerprint.ok_or_else(unexpected_message)?;
    let xpub = Xpub::from_str(&reply.xpub).map_err(|_| unexpected_message())?;
    // The key is at the depth of the path that was asked for, or the device answered another
    // question.
    if usize::from(xpub.depth) != path.as_ref().len() {
      return Err(unexpected_message());
    }
    Ok((Fingerprint::from(root.to_be_bytes()), xpub))
  }

  /// Finds the vault key that the wallet of `session` holds, and checks that the device gives
  /// the same extended key as the vault does.
  pub(crate) fn match_key(
    &mut self,
    session: u8,
    request: &SignRequest<'_>,
    coin: &str,
  ) -> Result<Matched, Error> {
    let default_path = account_path(request.network);
    let (fingerprint, default_xpub) = self.public_key(session, &default_path, coin)?;
    let vault = parse_vault(
      DEVICE_NAME,
      request.receive_descriptor,
      request.change_descriptor,
    )?
    .for_device(fingerprint)?;
    // A vault key may sit at another account path than the usual one. The device answers for
    // that path too, or it refuses with an error that says why.
    let xpub = if vault.our_account_path == default_path {
      default_xpub
    } else {
      self.public_key(session, &vault.our_account_path, coin)?.1
    };
    if !same_key(&xpub, &vault.keys[vault.our_key_index].xpub) {
      return Err(Error::new(
        ErrorKind::KeyNotInVault,
        format!(
          "The connected {DEVICE_NAME} (fingerprint {fingerprint}) has the fingerprint of a key of this vault, but its key at m/{} is a different key. Check that the wallet configuration is the one for this {DEVICE_NAME}, and check the passphrase. A {DEVICE_NAME} with the optional passphrase has a different key for each passphrase. To sign with another device, unplug this {DEVICE_NAME}.",
          vault.our_account_path
        ),
      ));
    }
    Ok(Matched { vault, fingerprint })
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn features() -> Features {
    Features {
      major_version: 2,
      minor_version: 13,
      patch_version: 1,
      bootloader_mode: Some(false),
      passphrase_protection: Some(false),
      initialized: Some(true),
      unlocked: Some(true),
      firmware_present: Some(true),
      passphrase_always_on_device: Some(false),
      internal_model: Some("T3W1".to_string()),
    }
  }

  #[test]
  fn the_coins_follow_the_network() {
    assert_eq!(coin_name(Network::Bitcoin).ok(), Some("Bitcoin"));
    assert_eq!(coin_name(Network::Testnet).ok(), Some("Testnet"));
    assert_eq!(coin_name(Network::Testnet4).ok(), Some("Testnet"));
    assert_eq!(coin_name(Network::Signet).ok(), Some("Testnet"));
    assert_eq!(coin_name(Network::Regtest).ok(), Some("Regtest"));
  }

  #[test]
  fn the_account_path_has_the_coin_type_of_the_network() {
    assert_eq!(account_path(Network::Bitcoin).to_string(), "48'/0'/0'/2'");
    assert_eq!(account_path(Network::Testnet).to_string(), "48'/1'/0'/2'");
    assert_eq!(account_path(Network::Regtest).to_string(), "48'/1'/0'/2'");
    assert_eq!(
      path_numbers(&account_path(Network::Bitcoin)),
      vec![0x8000_0030, 0x8000_0000, 0x8000_0000, 0x8000_0002]
    );
  }

  #[test]
  fn a_safe_7_with_a_wallet_passes() {
    assert!(check_features(&features()).is_ok());
  }

  #[test]
  fn another_model_is_refused() {
    let mut other = features();
    other.internal_model = Some("T3T1".to_string());
    assert_eq!(
      check_features(&other).expect_err("wrong model").kind,
      ErrorKind::Other
    );
    other.internal_model = None;
    assert!(check_features(&other).is_err());
  }

  #[test]
  fn a_bootloader_is_refused_with_the_bootloader_message() {
    let mut features = features();
    features.bootloader_mode = Some(true);
    let error = check_features(&features).expect_err("bootloader");
    assert_eq!(error.kind, ErrorKind::Bootloader);
    assert_eq!(error.message, BOOTLOADER_MESSAGE);
    let mut features = self::features();
    features.firmware_present = Some(false);
    assert_eq!(
      check_features(&features).expect_err("no firmware").kind,
      ErrorKind::Bootloader
    );
  }

  #[test]
  fn firmware_2_9_3_is_the_floor() {
    let mut features = features();
    for (version, ok) in [
      ((2, 9, 3), true),
      ((2, 10, 0), true),
      ((3, 0, 0), true),
      ((2, 9, 2), false),
      ((2, 8, 99), false),
      ((1, 99, 99), false),
    ] {
      (
        features.major_version,
        features.minor_version,
        features.patch_version,
      ) = version;
      let result = check_features(&features);
      assert_eq!(result.is_ok(), ok, "{version:?}");
      if let Err(error) = result {
        assert_eq!(error.kind, ErrorKind::FirmwareTooOld);
        assert!(error.message.contains("2.9.3"), "{}", error.message);
      }
    }
  }

  #[test]
  fn a_device_without_a_wallet_is_refused() {
    let mut features = features();
    features.initialized = Some(false);
    assert_eq!(
      check_features(&features).expect_err("not set up").kind,
      ErrorKind::NotInitialized
    );
    features.initialized = None;
    assert!(check_features(&features).is_err());
  }

  #[test]
  fn two_keys_are_the_same_key_whatever_the_network_prefix() {
    let secp = bitcoin::secp256k1::Secp256k1::new();
    let master = bitcoin::bip32::Xpriv::new_master(NetworkKind::Main, &[1; 32]).expect("a key");
    let main = Xpub::from_priv(&secp, &master);
    let mut test = main;
    test.network = NetworkKind::Test;
    assert!(same_key(&main, &test));
    let mut other = main;
    other.depth += 1;
    assert!(!same_key(&main, &other));
    let other = Xpub::from_priv(
      &secp,
      &bitcoin::bip32::Xpriv::new_master(NetworkKind::Main, &[2; 32]).expect("a key"),
    );
    assert!(!same_key(&main, &other));
  }
}
