use crate::error::Error;
use bitbox_api::btc::KeyOriginInfo;
use bitbox_api::Keypath;
use bitcoin::bip32::Fingerprint;
use svra_vault::{parse_vault, Vault};

/// How the messages of the shared vault code name this device.
pub(crate) const DEVICE_NAME: &str = "BitBox02";

/// The BIP-388 wallet policy for a Swan vault, as one connected device sees it.
pub struct PolicyArtifact {
  /// The policy string, for example `wsh(multi(2,@0/**,@1/**,@2/**))`.
  pub policy: String,
  /// The keys, in descriptor order.
  pub keys: Vec<KeyOriginInfo>,
  /// Index of the connected device's key in `keys`.
  pub our_key_index: usize,
  /// Account keypath of the connected device's key, for example `m/48'/0'/0'/2'`.
  pub our_account_keypath: Keypath,
}

impl PolicyArtifact {
  /// The policy for the device that `vault` was read for.
  pub(crate) fn for_vault(vault: &Vault) -> PolicyArtifact {
    let keys: Vec<KeyOriginInfo> = vault
      .keys
      .iter()
      .map(|key| match &key.origin {
        // A key without a path derives straight from the master key. The device needs no origin
        // for it, and sending the bare fingerprint would show it as `[cccccccc/]xpub`.
        Some((fingerprint, path)) if !path.as_ref().is_empty() => KeyOriginInfo {
          root_fingerprint: Some(*fingerprint),
          keypath: Some(Keypath::from(path)),
          xpub: key.xpub,
        },
        _ => KeyOriginInfo {
          root_fingerprint: None,
          keypath: None,
          xpub: key.xpub,
        },
      })
      .collect();
    let placeholders: Vec<String> = (0..keys.len())
      .map(|index| format!("@{index}/**"))
      .collect();
    PolicyArtifact {
      policy: format!("wsh(multi({},{}))", vault.threshold, placeholders.join(",")),
      keys,
      our_key_index: vault.our_key_index,
      our_account_keypath: Keypath::from(&vault.our_account_path),
    }
  }
}

/// Builds the wallet policy from the descriptors the user pasted.
///
/// `receive_descriptor` is a receive descriptor (`.../0/*`) or a multipath descriptor
/// (`.../<0;1>/*`). `change_descriptor`, when given, must be the `/1/*` twin of the receive
/// descriptor. `our_root_fingerprint` is the fingerprint the connected device reports.
pub fn build_policy(
  receive_descriptor: &str,
  change_descriptor: Option<&str>,
  our_root_fingerprint: Fingerprint,
) -> Result<PolicyArtifact, Error> {
  let vault = parse_vault(DEVICE_NAME, receive_descriptor, change_descriptor)?
    .for_device(our_root_fingerprint)?;
  Ok(PolicyArtifact::for_vault(&vault))
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::error::ErrorKind;
  use crate::test_support::{
    descriptor, fingerprint_of, simulator_xprv, webapp_keys, VaultKeys, ORDERS,
    WEBAPP_CLOUD_XPUB as CLOUD_XPUB, WEBAPP_GHOST_MACHINE_XPUB as GHOST_MACHINE_XPUB,
    WEBAPP_KEEN_JOIN_XPUB as KEEN_JOIN_XPUB,
  };
  use bitbox_api::btc::make_script_config_policy;
  use bitbox_api::pb;
  use bitcoin::bip32::Xpub;
  use bitcoin::NetworkKind;
  use std::str::FromStr;

  fn webapp_descriptor(tail: &str) -> String {
    let [cloud, ghost, keen] = webapp_keys(tail);
    format!("wsh(multi(2,{cloud},{ghost},{keen}))")
  }

  fn fingerprint(hex: &str) -> Fingerprint {
    Fingerprint::from_str(hex).expect("a fingerprint")
  }

  fn xpub(text: &str) -> Xpub {
    Xpub::from_str(text).expect("an xpub")
  }

  fn build(receive: &str, change: Option<&str>, device: &str) -> Result<PolicyArtifact, Error> {
    build_policy(receive, change, fingerprint(device))
  }

  fn expect_error(result: Result<PolicyArtifact, Error>, kind: ErrorKind) -> Error {
    match result {
      Ok(_) => panic!("the policy was built, but it should fail with {kind:?}"),
      Err(error) => {
        assert_eq!(error.kind, kind, "{}", error.message);
        error
      }
    }
  }

  /// The keys of the artifact as the protobuf message that goes to the device.
  fn wire_keys(artifact: &PolicyArtifact) -> Vec<pb::KeyOriginInfo> {
    match make_script_config_policy(&artifact.policy, &artifact.keys).config {
      Some(pb::btc_script_config::Config::Policy(policy)) => policy.keys,
      _ => panic!("a policy config"),
    }
  }

  fn wire_xpub(xpub: &Xpub) -> pb::XPub {
    pb::XPub {
      depth: vec![xpub.depth],
      parent_fingerprint: xpub.parent_fingerprint[..].to_vec(),
      child_num: xpub.child_number.into(),
      chain_code: xpub.chain_code[..].to_vec(),
      public_key: xpub.public_key.serialize().to_vec(),
    }
  }

  const TESTNET_ACCOUNT: [u32; 4] = [0x8000_0030, 0x8000_0001, 0x8000_0000, 0x8000_0002];

  #[test]
  fn builds_the_policy_of_the_webapp_vault_with_its_checksum() {
    let descriptor = format!("{}#scfc2wh5", webapp_descriptor("/0/*"));
    let artifact = build(&descriptor, None, "dcbf0caf").expect("the policy is built");
    assert_eq!(artifact.policy, "wsh(multi(2,@0/**,@1/**,@2/**))");
    assert_eq!(artifact.our_key_index, 2);
    assert_eq!(artifact.our_account_keypath.to_vec(), TESTNET_ACCOUNT);
  }

  #[test]
  fn the_policy_config_is_the_one_the_webapp_registers() {
    let artifact =
      build(&webapp_descriptor("/0/*"), None, "dcbf0caf").expect("the policy is built");
    let expected = pb::BtcScriptConfig {
      config: Some(pb::btc_script_config::Config::Policy(
        pb::btc_script_config::Policy {
          policy: "wsh(multi(2,@0/**,@1/**,@2/**))".to_string(),
          keys: vec![
            // The cloud key goes without an origin: no fingerprint and no path.
            pb::KeyOriginInfo {
              root_fingerprint: vec![],
              keypath: vec![],
              xpub: Some(wire_xpub(&xpub(CLOUD_XPUB))),
            },
            pb::KeyOriginInfo {
              root_fingerprint: vec![0x8c, 0x24, 0xa5, 0x10],
              keypath: TESTNET_ACCOUNT.to_vec(),
              xpub: Some(wire_xpub(&xpub(GHOST_MACHINE_XPUB))),
            },
            pb::KeyOriginInfo {
              root_fingerprint: vec![0xdc, 0xbf, 0x0c, 0xaf],
              keypath: TESTNET_ACCOUNT.to_vec(),
              xpub: Some(wire_xpub(&xpub(KEEN_JOIN_XPUB))),
            },
          ],
        },
      )),
    };
    assert_eq!(
      make_script_config_policy(&artifact.policy, &artifact.keys),
      expected
    );
  }

  #[test]
  fn the_policy_has_no_spaces_and_no_legacy_multisig_config() {
    let artifact = build(&webapp_descriptor("/0/*"), None, "dcbf0caf").expect("built");
    assert!(!artifact.policy.contains(' '));
    let config = make_script_config_policy(&artifact.policy, &artifact.keys);
    assert!(matches!(
      config.config,
      Some(pb::btc_script_config::Config::Policy(_))
    ));
  }

  #[test]
  fn keeps_descriptor_order_and_finds_the_device_wherever_it_is() {
    for (device, index) in [("8c24a510", 1), ("dcbf0caf", 2)] {
      let artifact = build(&webapp_descriptor("/0/*"), None, device).expect("the policy is built");
      assert_eq!(artifact.our_key_index, index);
      let xpubs: Vec<Xpub> = artifact.keys.iter().map(|key| key.xpub).collect();
      assert_eq!(
        xpubs,
        vec![
          xpub(CLOUD_XPUB),
          xpub(GHOST_MACHINE_XPUB),
          xpub(KEEN_JOIN_XPUB)
        ]
      );
    }
  }

  #[test]
  fn reads_a_fingerprint_in_the_descriptor_in_upper_case() {
    // The device reports its fingerprint in lower case. The descriptor is what the user pasted.
    let descriptor = webapp_descriptor("/0/*").replace("[dcbf0caf/", "[DCBF0CAF/");
    assert!(descriptor.contains("[DCBF0CAF/"));
    let artifact = build(&descriptor, None, "dcbf0caf").expect("the policy is built");
    assert_eq!(artifact.our_key_index, 2);
    assert_eq!(
      artifact.keys[2].root_fingerprint,
      Some(fingerprint("dcbf0caf"))
    );
  }

  #[test]
  fn accepts_apostrophes_and_h_for_hardened_steps() {
    let with_h = webapp_descriptor("/0/*");
    let with_apostrophe = with_h.replace("h/", "'/").replace("h]", "']");
    let from_h = build(&with_h, None, "dcbf0caf").expect("h");
    let from_apostrophe = build(&with_apostrophe, None, "dcbf0caf").expect("apostrophe");
    assert_eq!(from_h.policy, from_apostrophe.policy);
    assert_eq!(
      from_h.our_account_keypath.to_vec(),
      from_apostrophe.our_account_keypath.to_vec()
    );
    assert_eq!(wire_keys(&from_h), wire_keys(&from_apostrophe));
  }

  #[test]
  fn accepts_a_descriptor_with_or_without_a_checksum() {
    let keys = VaultKeys::new(&simulator_xprv(), NetworkKind::Test);
    let with_checksum = descriptor(&keys.expressions(), "/0/*");
    assert!(with_checksum.contains('#'));
    let without_checksum = with_checksum.split('#').next().expect("a body").to_string();
    let device = fingerprint_of(&simulator_xprv()).to_string();
    let a = build(&with_checksum, None, &device).expect("with checksum");
    let b = build(&without_checksum, None, &device).expect("without checksum");
    assert_eq!(a.policy, b.policy);
  }

  #[test]
  fn accepts_a_multipath_descriptor() {
    let artifact = build(&webapp_descriptor("/<0;1>/*"), None, "dcbf0caf").expect("multipath");
    assert_eq!(artifact.policy, "wsh(multi(2,@0/**,@1/**,@2/**))");
    assert_eq!(artifact.our_key_index, 2);
  }

  #[test]
  fn accepts_a_receive_and_a_change_descriptor() {
    let receive = webapp_descriptor("/0/*");
    let change = webapp_descriptor("/1/*");
    let both = build(&receive, Some(&change), "dcbf0caf").expect("receive and change");
    let receive_only = build(&receive, None, "dcbf0caf").expect("receive only");
    assert_eq!(both.policy, receive_only.policy);
    assert_eq!(wire_keys(&both), wire_keys(&receive_only));
  }

  #[test]
  fn accepts_mainnet_and_testnet_keys_with_the_device_at_every_position() {
    for (kind, coin) in [(NetworkKind::Main, 0), (NetworkKind::Test, 1)] {
      let keys = VaultKeys::new(&simulator_xprv(), kind);
      let device = fingerprint_of(&simulator_xprv());
      let expressions = keys.expressions();
      for order in ORDERS {
        let ordered: Vec<&str> = order
          .iter()
          .map(|position| expressions[*position])
          .collect();
        let artifact =
          build_policy(&descriptor(&ordered, "/0/*"), None, device).expect("the policy is built");
        let device_position = order
          .iter()
          .position(|position| *position == 0)
          .expect("device");
        let cloud_position = order
          .iter()
          .position(|position| *position == 2)
          .expect("cloud");
        assert_eq!(artifact.our_key_index, device_position);
        assert_eq!(
          artifact.our_account_keypath.to_vec(),
          vec![0x8000_0030, 0x8000_0000 + coin, 0x8000_0000, 0x8000_0002]
        );
        let wire = wire_keys(&artifact);
        assert!(wire[cloud_position].root_fingerprint.is_empty());
        assert!(wire[cloud_position].keypath.is_empty());
        assert_eq!(
          wire[device_position].root_fingerprint,
          device.as_bytes().to_vec()
        );
      }
    }
  }

  #[test]
  fn reads_the_threshold_and_the_key_count_from_the_descriptor() {
    let keys = VaultKeys::new(&simulator_xprv(), NetworkKind::Test);
    let [device, software, cloud] = keys.expressions();
    let two_of_two = format!("wsh(multi(2,{device}/0/*,{cloud}/0/*))");
    let artifact =
      build_policy(&two_of_two, None, fingerprint_of(&simulator_xprv())).expect("two of two");
    assert_eq!(artifact.policy, "wsh(multi(2,@0/**,@1/**))");

    let one_of_three = format!("wsh(multi(1,{device}/0/*,{software}/0/*,{cloud}/0/*))");
    let artifact =
      build_policy(&one_of_three, None, fingerprint_of(&simulator_xprv())).expect("one of three");
    assert_eq!(artifact.policy, "wsh(multi(1,@0/**,@1/**,@2/**))");
  }

  #[test]
  fn a_key_with_a_bare_fingerprint_origin_is_sent_without_an_origin() {
    let artifact = build(&webapp_descriptor("/0/*"), None, "dcbf0caf").expect("built");
    assert_eq!(artifact.keys[0].root_fingerprint, None);
    assert!(artifact.keys[0].keypath.is_none());
    assert_eq!(
      artifact.keys[2].root_fingerprint,
      Some(fingerprint("dcbf0caf"))
    );
  }

  // The shared vault code builds its messages from the device name. These tests pin the sentences
  // that a BitBox02 user reads.
  #[test]
  fn a_refused_descriptor_names_the_bitbox02() {
    let sorted = webapp_descriptor("/0/*").replace("multi(", "sortedmulti(");
    let error = expect_error(
      build(&sorted, None, "dcbf0caf"),
      ErrorKind::UnsupportedDescriptor,
    );
    assert!(
      error.message.ends_with(
        "With a BitBox02, SVRA can sign only for a Swan vault. Paste the wallet configuration from your Swan Vault Recovery Sheet."
      ),
      "{}",
      error.message
    );
  }

  #[test]
  fn a_device_without_a_key_of_the_vault_is_called_a_bitbox02() {
    let error = expect_error(
      build(&webapp_descriptor("/0/*"), None, "deadbeef"),
      ErrorKind::KeyNotInVault,
    );
    assert_eq!(
      error.message,
      "The connected BitBox02 (fingerprint deadbeef) does not hold a key of this vault. Connect the BitBox02 that holds one of the vault keys. A BitBox02 with the optional passphrase has a different key for each passphrase, so check the passphrase. To sign with another device, unplug this BitBox02."
    );
  }
}
