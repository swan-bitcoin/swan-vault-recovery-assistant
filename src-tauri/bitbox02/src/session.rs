use crate::device_error::{map_device_error, Step};
use crate::error::{Error, ErrorKind};
use crate::policy::parse_vault;
use crate::psbt_checks::{already_signed, precheck, verify_signed};
use bitbox_api::btc::make_script_config_policy;
use bitbox_api::pb::{
  btc_register_script_config_request::XPubType, btc_sign_init_request::FormatUnit, BtcCoin,
  BtcScriptConfigWithKeypath,
};
use bitbox_api::runtime::Runtime;
use bitbox_api::BitBox;
use bitcoin::bip32::Fingerprint;
use bitcoin::psbt::Psbt;
use bitcoin::Network;
use std::str::FromStr;

/// Name the vault policy is registered under on the device. The webapp uses the same name.
pub const POLICY_NAME: &str = "swan_vault";

/// Oldest firmware that supports `wsh()` wallet policies.
pub const MIN_FIRMWARE_VERSION: &str = "9.15.0";

/// Oldest firmware that supports regtest.
const MIN_FIRMWARE_VERSION_REGTEST: &str = "9.21.0";

/// What the device session is doing, so the app can tell the user where to look.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Progress {
  /// Opening the device.
  Connecting,
  /// Waiting for the user to enter the device password.
  Unlock,
  /// Waiting for the user to compare this code with the device screen and confirm on the device.
  ConfirmPairing { code: String },
  /// Asking the device whether it holds the vault registration.
  CheckingRegistration,
  /// Waiting for the user to confirm the vault registration on the device.
  Register,
  /// Waiting for the user to confirm the transaction on the device.
  Sign,
}

/// One signing attempt.
pub struct SignRequest<'a> {
  pub network: bitcoin::Network,
  /// Receive descriptor (`.../0/*`) or multipath descriptor (`.../<0;1>/*`).
  pub receive_descriptor: &'a str,
  /// Optional change descriptor (`.../1/*`).
  pub change_descriptor: Option<&'a str>,
  pub psbt: Psbt,
}

pub struct SignOutcome {
  /// The PSBT, with the device's signatures added when `signed` is true.
  pub psbt: Psbt,
  /// False when the device's key had already signed every input, so nothing was added.
  pub signed: bool,
  /// Root fingerprint of the device that signed.
  pub fingerprint: Fingerprint,
  /// True when this attempt registered the vault on the device.
  pub registered: bool,
}

/// The coin that the device is asked about. Testnet, testnet4 and signet all use `Tbtc`, because
/// the device knows one coin for them.
pub(crate) fn coin_for_network(network: Network) -> Result<BtcCoin, Error> {
  match network {
    Network::Bitcoin => Ok(BtcCoin::Btc),
    Network::Testnet | Network::Testnet4 | Network::Signet => Ok(BtcCoin::Tbtc),
    Network::Regtest => Ok(BtcCoin::Rbtc),
    other => Err(Error::new(
      ErrorKind::Other,
      format!("The BitBox02 does not support the {other} network."),
    )),
  }
}

/// Checks that the firmware supports vault policies, and regtest when the network is regtest.
pub(crate) fn check_firmware(version: &semver::Version, network: Network) -> Result<(), Error> {
  let (needed, reason) = match network {
    Network::Regtest => (MIN_FIRMWARE_VERSION_REGTEST, " for regtest"),
    _ => (MIN_FIRMWARE_VERSION, ""),
  };
  let needed_version = semver::Version::parse(needed)
    .map_err(|_| Error::new(ErrorKind::Other, "The firmware version limit is not valid."))?;
  if *version >= needed_version {
    return Ok(());
  }
  Err(Error::new(
    ErrorKind::FirmwareTooOld,
    format!(
      "This BitBox02 runs firmware {version}. Signing a Swan vault needs firmware {needed}{reason} or newer. Update the firmware in the BitBoxApp, then try again."
    ),
  ))
}

/// Runs one signing attempt on an opened, not yet paired device: unlock, pair, check the
/// registration, register if needed, sign, verify.
pub async fn sign_psbt<R: Runtime>(
  device: BitBox<R>,
  request: SignRequest<'_>,
  on_progress: &mut dyn FnMut(Progress),
) -> Result<SignOutcome, Error> {
  let coin = coin_for_network(request.network)?;
  // Read the descriptors first, so that a descriptor the app cannot use fails before the user
  // has to unlock the device.
  let parsed_vault = parse_vault(request.receive_descriptor, request.change_descriptor)?;

  on_progress(Progress::Unlock);
  let pairing = device
    .unlock_and_pair()
    .await
    .map_err(|error| map_device_error(error, Step::Connect))?;
  if let Some(code) = pairing.get_pairing_code() {
    on_progress(Progress::ConfirmPairing { code });
  }
  let paired = pairing
    .wait_confirm()
    .await
    .map_err(|error| map_device_error(error, Step::Pair))?;

  // An uninitialized device pairs without error: the firmware answers the unlock request with
  // a status byte that the library ignores. The device info tells the two cases apart.
  let info = paired
    .device_info()
    .await
    .map_err(|error| map_device_error(error, Step::Query))?;
  if !info.initialized {
    return Err(Error::new(
      ErrorKind::NotInitialized,
      "This BitBox02 has no wallet yet. Set it up or restore it in the BitBoxApp first, then try again.",
    ));
  }
  check_firmware(paired.version(), request.network)?;

  let fingerprint = paired
    .root_fingerprint()
    .await
    .map_err(|error| map_device_error(error, Step::Query))
    .and_then(|hex| {
      Fingerprint::from_str(&hex).map_err(|_| {
        Error::new(
          ErrorKind::Communication,
          "The BitBox02 sent a fingerprint that SVRA cannot read. Unplug it, plug it in again, and try again.",
        )
      })
    })?;
  let vault = parsed_vault.for_device(fingerprint)?;
  let our_keys = precheck(&request.psbt, fingerprint, &vault)?;

  if already_signed(&request.psbt, &our_keys) {
    return Ok(SignOutcome {
      psbt: request.psbt,
      signed: false,
      fingerprint,
      registered: false,
    });
  }

  let artifact = &vault.artifact;
  let config = make_script_config_policy(&artifact.policy, &artifact.keys);

  on_progress(Progress::CheckingRegistration);
  let is_registered = paired
    .btc_is_script_config_registered(coin, &config, None)
    .await
    .map_err(|error| map_device_error(error, Step::Registration(coin)))?;
  if !is_registered {
    on_progress(Progress::Register);
    paired
      .btc_register_script_config(
        coin,
        &config,
        None,
        XPubType::AutoXpubTpub,
        Some(POLICY_NAME),
      )
      .await
      .map_err(|error| map_device_error(error, Step::Register(coin)))?;
  }

  on_progress(Progress::Sign);
  let mut signed_psbt = request.psbt.clone();
  paired
    .btc_sign_psbt(
      coin,
      &mut signed_psbt,
      Some(BtcScriptConfigWithKeypath {
        script_config: Some(config),
        keypath: artifact.our_account_keypath.to_vec(),
      }),
      FormatUnit::Default,
    )
    .await
    .map_err(|error| map_device_error(error, Step::Sign(coin)))?;

  verify_signed(&request.psbt, &signed_psbt, &our_keys)?;

  Ok(SignOutcome {
    psbt: signed_psbt,
    signed: true,
    fingerprint,
    registered: !is_registered,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  fn version(text: &str) -> semver::Version {
    semver::Version::parse(text).expect("test version is valid")
  }

  #[test]
  fn the_minimum_firmware_constants_are_valid_versions() {
    assert!(semver::Version::parse(MIN_FIRMWARE_VERSION).is_ok());
    assert!(semver::Version::parse(MIN_FIRMWARE_VERSION_REGTEST).is_ok());
  }

  #[test]
  fn coins_follow_the_network() {
    assert_eq!(coin_for_network(Network::Bitcoin).ok(), Some(BtcCoin::Btc));
    assert_eq!(coin_for_network(Network::Testnet).ok(), Some(BtcCoin::Tbtc));
    assert_eq!(
      coin_for_network(Network::Testnet4).ok(),
      Some(BtcCoin::Tbtc)
    );
    assert_eq!(coin_for_network(Network::Signet).ok(), Some(BtcCoin::Tbtc));
    assert_eq!(coin_for_network(Network::Regtest).ok(), Some(BtcCoin::Rbtc));
  }

  #[test]
  fn firmware_9_15_0_is_the_floor_for_policies() {
    assert!(check_firmware(&version("9.15.0"), Network::Bitcoin).is_ok());
    assert!(check_firmware(&version("9.27.1"), Network::Testnet).is_ok());
    let too_old =
      check_firmware(&version("9.14.1"), Network::Bitcoin).expect_err("9.14.1 is too old");
    assert_eq!(too_old.kind, ErrorKind::FirmwareTooOld);
    assert!(too_old.message.contains("9.14.1"), "{}", too_old.message);
    assert!(too_old.message.contains("9.15.0"), "{}", too_old.message);
  }

  #[test]
  fn regtest_needs_firmware_9_21_0() {
    assert!(check_firmware(&version("9.21.0"), Network::Regtest).is_ok());
    let too_old = check_firmware(&version("9.20.0"), Network::Regtest)
      .expect_err("9.20.0 is too old for regtest");
    assert_eq!(too_old.kind, ErrorKind::FirmwareTooOld);
    assert!(too_old.message.contains("9.21.0"), "{}", too_old.message);
    assert!(too_old.message.contains("regtest"), "{}", too_old.message);
    assert!(check_firmware(&version("9.20.0"), Network::Testnet).is_ok());
  }
}
