//! One signing session with a BitBox02. Three terms explain the steps below.
//!
//! Pairing: the app and the device set up an encrypted channel. The device shows a short code,
//! and the app shows the same code. The user compares the two and confirms on the device, which
//! proves that nobody sits between the app and the device.
//!
//! Registration: the device signs for a multisig wallet only when it holds that wallet's policy.
//! The policy is the script template plus the ordered list of keys. The user confirms each key on
//! the device when the policy is added. A factory reset erases the registration, so the app asks
//! the device first and registers only when the device does not know the vault.
//!
//! Fingerprint: the device reports the fingerprint of its master key. The wallet configuration
//! writes each customer key as `[fingerprint/path]xpub`, so the fingerprint tells the app which
//! key in the wallet configuration is the device's own.

use crate::device_error::{map_device_error, Step};
use crate::error::{Error, ErrorKind};
use crate::policy::{PolicyArtifact, DEVICE_NAME};
use bitbox_api::btc::make_script_config_policy;
use bitbox_api::error::{BitBoxError, Error as DeviceError};
use bitbox_api::pb::{
  btc_register_script_config_request::XPubType, btc_sign_init_request::FormatUnit, BtcCoin,
  BtcScriptConfig, BtcScriptConfigWithKeypath,
};
use bitbox_api::runtime::Runtime;
use bitbox_api::{BitBox, PairedBitBox};
use bitcoin::bip32::Fingerprint;
use bitcoin::hashes::{sha256, Hash, HashEngine};
use bitcoin::psbt::Psbt;
use bitcoin::Network;
use std::str::FromStr;
use svra_vault::{already_signed, parse_vault, precheck, verify_signed};

/// Name the vault policy is registered under on the device. The webapp uses the same name.
pub const POLICY_NAME: &str = "swan_vault";

/// Oldest firmware that supports `wsh()` wallet policies.
pub const MIN_FIRMWARE_VERSION: semver::Version = semver::Version::new(9, 15, 0);

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
  /// Waiting for the user to confirm the vault registration on the device. `name` is the name
  /// that the device shows for the wallet. It comes twice when the device refuses
  /// [`POLICY_NAME`] because another wallet uses it: the second time with the fallback name.
  Register { name: String },
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

/// The coin that the device is asked about. Testnet, testnet4, signet and regtest all use `Tbtc`,
/// because the firmware accepts wallet policies for `Btc` and `Tbtc` only. On regtest the device
/// then shows addresses in the testnet format (`tb1...`), not `bcrt1...`.
pub(crate) fn coin_for_network(network: Network) -> Result<BtcCoin, Error> {
  match network {
    Network::Bitcoin => Ok(BtcCoin::Btc),
    Network::Testnet | Network::Testnet4 | Network::Signet | Network::Regtest => Ok(BtcCoin::Tbtc),
    other => Err(Error::new(
      ErrorKind::Other,
      format!("The BitBox02 does not support the {other} network."),
    )),
  }
}

/// Checks that the firmware supports vault policies.
pub(crate) fn check_firmware(version: &semver::Version) -> Result<(), Error> {
  if *version >= MIN_FIRMWARE_VERSION {
    return Ok(());
  }
  Err(Error::new(
    ErrorKind::FirmwareTooOld,
    format!(
      "This BitBox02 runs firmware {version}. Signing a Swan vault needs firmware {MIN_FIRMWARE_VERSION} or newer. Update the firmware in the BitBoxApp, then try again."
    ),
  ))
}

/// The name for the vault when another wallet on the device already uses [`POLICY_NAME`]. The
/// device tells wallets apart by a hash of coin, policy and keys, and keeps the name as a label
/// that must be unique. The name comes from the policy and the keys, so a vault gets the same name
/// on every run. At 19 bytes it fits the 30 bytes the device allows.
pub fn fallback_policy_name(artifact: &PolicyArtifact) -> String {
  let mut engine = sha256::Hash::engine();
  engine.input(artifact.policy.as_bytes());
  for key in &artifact.keys {
    engine.input(&key.xpub.encode());
  }
  let digest = sha256::Hash::from_engine(engine).to_string();
  format!("{POLICY_NAME}_{}", &digest[..8])
}

/// The device shows keys as xpub on mainnet and tpub elsewhere. This is the form of the wallet
/// configuration that the user compares the keys against, and the webapp uses the same setting.
const XPUB_TYPE: XPubType = XPubType::AutoXpubTpub;

/// Registers the vault on the device. The device refuses a name that another wallet uses, and it
/// says so only after the user confirmed the keys. This is why the second attempt makes the user
/// confirm the keys again.
async fn register_vault<R: Runtime>(
  paired: &PairedBitBox<R>,
  coin: BtcCoin,
  config: &BtcScriptConfig,
  artifact: &PolicyArtifact,
  on_progress: &mut dyn FnMut(Progress),
) -> Result<(), Error> {
  on_progress(Progress::Register {
    name: POLICY_NAME.to_string(),
  });
  match paired
    .btc_register_script_config(coin, config, None, XPUB_TYPE, Some(POLICY_NAME))
    .await
  {
    Err(DeviceError::BitBox(BitBoxError::Duplicate)) => {}
    result => return result.map_err(|error| map_device_error(error, Step::Register)),
  }

  let fallback = fallback_policy_name(artifact);
  on_progress(Progress::Register {
    name: fallback.clone(),
  });
  paired
    .btc_register_script_config(coin, config, None, XPUB_TYPE, Some(&fallback))
    .await
    .map_err(|error| map_device_error(error, Step::Register))
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
  let parsed_vault = parse_vault(
    DEVICE_NAME,
    request.receive_descriptor,
    request.change_descriptor,
  )?;

  on_progress(Progress::Unlock);
  let pairing = device
    .unlock_and_pair()
    .await
    .map_err(|error| map_device_error(error, Step::Unlock))?;
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
  check_firmware(paired.version())?;

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

  // Return before the registration check, so that the user does not confirm anything on the device
  // for a transaction that needs no signature from it. `signed: false` is what the HWI path
  // reports for the same case.
  if already_signed(&request.psbt, &our_keys, &vault) {
    return Ok(SignOutcome {
      psbt: request.psbt,
      signed: false,
      fingerprint,
      registered: false,
    });
  }

  let artifact = &PolicyArtifact::for_vault(&vault);
  let config = make_script_config_policy(&artifact.policy, &artifact.keys);

  on_progress(Progress::CheckingRegistration);
  let is_registered = paired
    .btc_is_script_config_registered(coin, &config, None)
    .await
    .map_err(|error| map_device_error(error, Step::CheckRegistration))?;
  if !is_registered {
    register_vault(&paired, coin, &config, artifact, on_progress).await?;
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
    .map_err(|error| map_device_error(error, Step::Sign))?;

  verify_signed(&request.psbt, &signed_psbt, &our_keys, &vault)?;

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
  use crate::test_support::{
    fingerprint_of, master_key, simulator_xprv, webapp_keys, Vault as Fixture,
  };
  use bitcoin::{Amount, NetworkKind};

  fn version(text: &str) -> semver::Version {
    semver::Version::parse(text).expect("test version is valid")
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
    // The firmware has no wallet policies for its regtest coin.
    assert_eq!(coin_for_network(Network::Regtest).ok(), Some(BtcCoin::Tbtc));
  }

  #[test]
  fn firmware_9_15_0_is_the_floor_for_policies() {
    assert!(check_firmware(&version("9.15.0")).is_ok());
    assert!(check_firmware(&version("9.27.1")).is_ok());
    let too_old = check_firmware(&version("9.14.1")).expect_err("9.14.1 is too old");
    assert_eq!(too_old.kind, ErrorKind::FirmwareTooOld);
    assert!(too_old.message.contains("9.14.1"), "{}", too_old.message);
    assert!(too_old.message.contains("9.15.0"), "{}", too_old.message);
  }

  /// The webapp's vault with the keys in the given order: 0 is the cloud key, 1 and 2 are the
  /// customer keys. The device is key 2.
  fn artifact(threshold: usize, order: [usize; 3]) -> PolicyArtifact {
    let keys = webapp_keys("/0/*");
    let descriptor = format!(
      "wsh(multi({threshold},{},{},{}))",
      keys[order[0]], keys[order[1]], keys[order[2]]
    );
    crate::build_policy(
      &descriptor,
      None,
      Fingerprint::from_str("dcbf0caf").expect("a fingerprint"),
    )
    .expect("the policy is built")
  }

  #[test]
  fn the_fallback_name_is_the_base_name_and_eight_hex_characters() {
    let name = fallback_policy_name(&artifact(2, [0, 1, 2]));
    let suffix = name
      .strip_prefix("swan_vault_")
      .expect("the name starts with the base name and an underscore");
    assert_eq!(suffix.len(), 8, "{name}");
    assert!(
      suffix
        .chars()
        .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c)),
      "{name}"
    );
    // The device allows 30 bytes of printable ASCII.
    assert!(name.len() <= 30);
    assert!(name.bytes().all(|byte| (0x20..0x7f).contains(&byte)));
  }

  #[test]
  fn the_fallback_name_of_a_vault_never_changes() {
    // SHA-256 over the policy string and the 78 bytes of each xpub in the order of the vault,
    // computed outside of this crate.
    let vault = artifact(2, [0, 1, 2]);
    assert_eq!(fallback_policy_name(&vault), "swan_vault_f990ad1d");
  }

  #[test]
  fn the_fallback_name_depends_on_the_policy_and_the_order_of_the_keys() {
    let name = fallback_policy_name(&artifact(2, [0, 1, 2]));
    assert_ne!(name, fallback_policy_name(&artifact(3, [0, 1, 2])));
    assert_ne!(name, fallback_policy_name(&artifact(2, [1, 0, 2])));
  }

  // The checks of the shared vault code build their messages from the device name that this crate
  // gives. These are the sentences that a BitBox02 user reads.
  #[test]
  fn the_psbt_refusals_name_the_bitbox02() {
    let mut fixture = Fixture::new(&simulator_xprv(), Network::Testnet);
    let psbt = fixture.sweep_psbt();
    let device = fingerprint_of(&simulator_xprv());
    let vault = parse_vault(
      DEVICE_NAME,
      &fixture.receive_descriptor,
      Some(&fixture.change_descriptor),
    )
    .expect("the descriptors are valid")
    .for_device(device)
    .expect("the device is in the vault");

    let other = fingerprint_of(&master_key(0x77, NetworkKind::Test));
    let error = precheck(&psbt, other, &vault).expect_err("the device has no key in the PSBT");
    assert_eq!(
      error.message,
      format!("This transaction was not made by SVRA for this vault, or it was changed. Input 1 has no key path for the connected BitBox02 (fingerprint {other}). Check that this BitBox02 holds a key of your vault.")
    );

    let keys = precheck(&psbt, device, &vault).expect("the pre-check passes");
    let error = verify_signed(&psbt, &psbt, &keys, &vault).expect_err("no signature");
    assert_eq!(
      error.message,
      "The BitBox02 returned no signature for input 1. Do not use the result. Contact Swan support."
    );

    let mut tampered = psbt.clone();
    tampered.unsigned_tx.output[0].value -= Amount::from_sat(1);
    let error = verify_signed(&psbt, &tampered, &keys, &vault).expect_err("another transaction");
    assert_eq!(
      error.message,
      "The BitBox02 returned a different transaction than the one SVRA sent. Do not use the result. Someone may have changed the transaction."
    );
  }
}
