use crate::error::{Error, ErrorKind};
use bitbox_api::btc::KeyOriginInfo;
use bitbox_api::Keypath;
use bitcoin::bip32::{ChildNumber, DerivationPath, Fingerprint, Xpub};
use miniscript::descriptor::{DescriptorPublicKey, Wildcard, WshInner};
use miniscript::{Descriptor, Terminal};
use std::str::FromStr;

const RECEIVE: ChildNumber = ChildNumber::Normal { index: 0 };
const CHANGE: ChildNumber = ChildNumber::Normal { index: 1 };

/// What SVRA supports, for the messages about a descriptor it refuses.
const SUPPORTED: &str = "SVRA signs only vault descriptors of the form wsh(multi(k,...)). The keys must end in /0/* (receive), /1/* (change) or /<0;1>/*.";

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

/// A policy artifact with the threshold, which the session needs to rebuild the witness script.
pub(crate) struct Vault {
  pub artifact: PolicyArtifact,
  pub threshold: usize,
}

/// One key of a vault descriptor.
#[derive(Clone, PartialEq)]
struct VaultKey {
  /// The origin as the descriptor writes it. A bare `[fingerprint]` has an empty path.
  origin: Option<(Fingerprint, DerivationPath)>,
  xpub: Xpub,
}

/// How the keys of a descriptor end.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Keychain {
  Receive,
  Change,
  Multipath,
}

struct ParsedDescriptor {
  threshold: usize,
  keys: Vec<VaultKey>,
  keychain: Keychain,
}

/// The vault descriptors, read and checked without a device.
pub(crate) struct ParsedVault {
  threshold: usize,
  keys: Vec<VaultKey>,
}

fn unsupported(message: impl Into<String>) -> Error {
  Error::new(ErrorKind::UnsupportedDescriptor, message)
}

/// Reads one descriptor. `label` names it in the messages, for example "receive descriptor".
fn parse_descriptor(text: &str, label: &str) -> Result<ParsedDescriptor, Error> {
  // The parse error is not shown, because it can repeat what the user pasted.
  let descriptor = Descriptor::<DescriptorPublicKey>::from_str(text.trim()).map_err(|_| {
    unsupported(format!(
      "The {label} is not a valid descriptor. Check that you copied all of it, including the checksum after the # sign. {SUPPORTED}"
    ))
  })?;

  let Descriptor::Wsh(wsh) = &descriptor else {
    return Err(unsupported(format!(
      "The {label} is not a wsh() descriptor. {SUPPORTED}"
    )));
  };
  let miniscript = match wsh.as_inner() {
    WshInner::Ms(miniscript) => miniscript,
    WshInner::SortedMulti(_) => {
      return Err(unsupported(format!(
        "The {label} uses sortedmulti(). A Swan vault does not sort its keys, so SVRA cannot sign it. {SUPPORTED}"
      )))
    }
  };
  let Terminal::Multi(threshold) = &miniscript.node else {
    return Err(unsupported(format!(
      "The {label} is not a multi() descriptor. {SUPPORTED}"
    )));
  };
  if threshold.n() < 2 {
    return Err(unsupported(format!(
      "The {label} has only one key. A vault needs at least two keys."
    )));
  }

  let mut keychain = None;
  let mut keys = Vec::with_capacity(threshold.n());
  for (index, key) in threshold.iter().enumerate() {
    let (this_keychain, key) = parse_key(key).ok_or_else(|| {
      unsupported(format!(
        "Key {} of the {label} is not an extended public key that ends in /0/*, /1/* or /<0;1>/*. {SUPPORTED}",
        index + 1
      ))
    })?;
    match keychain {
      None => keychain = Some(this_keychain),
      Some(first) if first == this_keychain => {}
      Some(_) => {
        return Err(unsupported(format!(
          "The keys of the {label} do not all end in the same path. {SUPPORTED}"
        )))
      }
    }
    keys.push(key);
  }
  let keychain = keychain.ok_or_else(|| unsupported(format!("The {label} has no keys.")))?;

  Ok(ParsedDescriptor {
    threshold: threshold.k(),
    keys,
    keychain,
  })
}

/// Reads one key expression. Returns `None` when the key is not an extended public key with an
/// unhardened wildcard after exactly `/0`, `/1` or `/<0;1>`.
fn parse_key(key: &DescriptorPublicKey) -> Option<(Keychain, VaultKey)> {
  let (keychain, origin, xpub, wildcard) = match key {
    DescriptorPublicKey::XPub(key) => {
      let keychain = match key.derivation_path.as_ref() {
        [step] if *step == RECEIVE => Keychain::Receive,
        [step] if *step == CHANGE => Keychain::Change,
        _ => return None,
      };
      (keychain, &key.origin, key.xkey, key.wildcard)
    }
    DescriptorPublicKey::MultiXPub(key) => {
      let paths = key.derivation_paths.paths();
      let is_receive_and_change =
        paths.len() == 2 && paths[0].as_ref() == [RECEIVE] && paths[1].as_ref() == [CHANGE];
      if !is_receive_and_change {
        return None;
      }
      (Keychain::Multipath, &key.origin, key.xkey, key.wildcard)
    }
    DescriptorPublicKey::Single(_) => return None,
  };
  if wildcard != Wildcard::Unhardened {
    return None;
  }
  Some((
    keychain,
    VaultKey {
      origin: origin.clone(),
      xpub,
    },
  ))
}

/// Reads the receive descriptor, and the change descriptor when there is one, and checks that
/// they describe one vault.
pub(crate) fn parse_vault(
  receive_descriptor: &str,
  change_descriptor: Option<&str>,
) -> Result<ParsedVault, Error> {
  let receive = parse_descriptor(receive_descriptor, "receive descriptor")?;
  if receive.keychain == Keychain::Change {
    return Err(unsupported(
      "The receive descriptor ends in /1/*, which is the change path. Use the receive descriptor, which ends in /0/*.",
    ));
  }

  if let Some(change_descriptor) = change_descriptor {
    if receive.keychain == Keychain::Multipath {
      return Err(unsupported(
        "The receive descriptor is a multipath descriptor, so it already holds the change path. Leave the change descriptor empty.",
      ));
    }
    let change = parse_descriptor(change_descriptor, "change descriptor")?;
    if change.keychain != Keychain::Change {
      return Err(unsupported(
        "The change descriptor must end in /1/*. Use the change descriptor of the same vault.",
      ));
    }
    if change.threshold != receive.threshold || change.keys != receive.keys {
      return Err(unsupported(
        "The change descriptor is not the /1/* twin of the receive descriptor. Both must have the same threshold and the same keys, with the same origins, in the same order.",
      ));
    }
  }

  let mut seen = Vec::new();
  for key in &receive.keys {
    let identity = (key.xpub.public_key, key.xpub.chain_code);
    if seen.contains(&identity) {
      return Err(unsupported(
        "Two keys of the vault descriptor are the same key. A vault needs different keys.",
      ));
    }
    seen.push(identity);
  }

  Ok(ParsedVault {
    threshold: receive.threshold,
    keys: receive.keys,
  })
}

impl ParsedVault {
  /// Finds the connected device's key and builds the policy for it.
  pub(crate) fn for_device(self, our_root_fingerprint: Fingerprint) -> Result<Vault, Error> {
    // The cloud key has a fingerprint and no path, so it never matches, even when its fingerprint
    // equals the device's.
    let ours: Vec<usize> = self
      .keys
      .iter()
      .enumerate()
      .filter(|(_, key)| {
        matches!(
          &key.origin,
          Some((fingerprint, path))
            if *fingerprint == our_root_fingerprint && !path.as_ref().is_empty()
        )
      })
      .map(|(index, _)| index)
      .collect();
    let our_key_index = match ours.as_slice() {
      [index] => *index,
      [] => {
        return Err(Error::new(
          ErrorKind::KeyNotInVault,
          format!(
            "The connected BitBox02 (fingerprint {our_root_fingerprint}) does not hold a key of this vault. Connect the BitBox02 that holds one of the vault keys."
          ),
        ))
      }
      _ => {
        return Err(unsupported(
          "More than one key of this vault belongs to the connected BitBox02. SVRA cannot sign this vault with one device.",
        ))
      }
    };

    let keys: Vec<KeyOriginInfo> = self
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
    let policy = format!("wsh(multi({},{}))", self.threshold, placeholders.join(","));
    let our_account_keypath = keys[our_key_index]
      .keypath
      .clone()
      .ok_or_else(|| unsupported("The key of the connected BitBox02 has no key path."))?;

    Ok(Vault {
      artifact: PolicyArtifact {
        policy,
        keys,
        our_key_index,
        our_account_keypath,
      },
      threshold: self.threshold,
    })
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
  parse_vault(receive_descriptor, change_descriptor)?
    .for_device(our_root_fingerprint)
    .map(|vault| vault.artifact)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::test_support::{
    descriptor, fingerprint_of, simulator_xprv, VaultKeys, CLOUD_FINGERPRINT, ORDERS,
  };
  use bitbox_api::btc::make_script_config_policy;
  use bitbox_api::pb;
  use bitcoin::NetworkKind;

  // The testnet vault of the webapp's `buildBitboxPolicy.test.ts`, so that both implementations
  // are tested on the same input. The cloud key comes first, because the position follows the
  // BitGo key roles and nothing may assume that the cloud key is last.
  const CLOUD_XPUB: &str = "tpubD6NzVbkrYhZ4X3vCdevm3aFUdeSAWsbR4UhhdApbXnVUnvuwtq5NYqQ7zCkNhYG4JcPdGW4Wg4ZrVSYGpdoWsn337qmkP6CFgs7pZid12Sa";
  const GHOST_MACHINE_XPUB: &str = "tpubDDzWqfZ5TH48383Byd9PFGxEP1Ws5NVXyYcHTmnHwmhJciowLeBDWNHcpLGocofanSyVHeiNqL4HZkXZfKM7NKm7gZZoPjmA9vTKPpwRSkx";
  const KEEN_JOIN_XPUB: &str = "tpubDFd7VxopNeZg93uqR7CSvJLkw3UanF8rywdQTxhCPFt1P33eZkxJJ91XXEbY2Q4Suw3jyscRwGzjVyfgq97N7sRvPHQVxruHwsKvsvQizSk";

  fn webapp_descriptor(tail: &str) -> String {
    format!(
      "wsh(multi(2,[7737acb8]{CLOUD_XPUB}{tail},[8c24a510/48h/1h/0h/2h]{GHOST_MACHINE_XPUB}{tail},[dcbf0caf/48h/1h/0h/2h]{KEEN_JOIN_XPUB}{tail}))"
    )
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
  fn golden_policy_config_for_the_webapp_vault() {
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
  fn refuses_a_wrong_checksum() {
    let keys = VaultKeys::new(&simulator_xprv(), NetworkKind::Test);
    let body = descriptor(&keys.expressions(), "/0/*");
    let body = body.split('#').next().expect("a body");
    expect_error(
      build(&format!("{body}#aaaaaaaa"), None, "dcbf0caf"),
      ErrorKind::UnsupportedDescriptor,
    );
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
  fn refuses_a_single_key() {
    let keys = VaultKeys::new(&simulator_xprv(), NetworkKind::Test);
    let one = format!("wsh(multi(1,{}/0/*))", keys.device);
    expect_error(
      build_policy(&one, None, fingerprint_of(&simulator_xprv())),
      ErrorKind::UnsupportedDescriptor,
    );
  }

  #[test]
  fn refuses_sortedmulti_and_says_so() {
    let sorted = webapp_descriptor("/0/*").replace("multi(", "sortedmulti(");
    let error = expect_error(
      build(&sorted, None, "dcbf0caf"),
      ErrorKind::UnsupportedDescriptor,
    );
    assert!(error.message.contains("sortedmulti"), "{}", error.message);
    assert!(error.message.contains("wsh(multi("), "{}", error.message);
  }

  #[test]
  fn refuses_other_descriptor_types() {
    let keys = VaultKeys::new(&simulator_xprv(), NetworkKind::Test);
    let [device, software, cloud] = keys.expressions();
    for text in [
      format!("wsh(pk({device}/0/*))"),
      format!("sh(wsh(multi(2,{device}/0/*,{software}/0/*,{cloud}/0/*)))"),
      format!("wpkh({device}/0/*)"),
      format!("wsh(or_d(pk({device}/0/*),and_v(v:pk({software}/0/*),older(144))))"),
      format!("sh(multi(2,{device}/0/*,{software}/0/*,{cloud}/0/*))"),
    ] {
      expect_error(
        build_policy(&text, None, fingerprint_of(&simulator_xprv())),
        ErrorKind::UnsupportedDescriptor,
      );
    }
  }

  #[test]
  fn refuses_a_threshold_above_the_key_count() {
    let seven = webapp_descriptor("/0/*").replace("multi(2,", "multi(7,");
    expect_error(
      build(&seven, None, "dcbf0caf"),
      ErrorKind::UnsupportedDescriptor,
    );
  }

  #[test]
  fn refuses_keys_on_the_change_path_in_the_receive_descriptor() {
    let error = expect_error(
      build(&webapp_descriptor("/1/*"), None, "dcbf0caf"),
      ErrorKind::UnsupportedDescriptor,
    );
    assert!(error.message.contains("change"), "{}", error.message);
  }

  #[test]
  fn refuses_paths_it_does_not_understand() {
    let keys = VaultKeys::new(&simulator_xprv(), NetworkKind::Test);
    let device = fingerprint_of(&simulator_xprv()).to_string();
    for tail in [
      "/0/*h",
      "/0/*'",
      "/0/0/*",
      "/2/*",
      "/0",
      "/*",
      "/<0;2>/*",
      "/<1;0>/*",
      "/<0;1;2>/*",
      "",
    ] {
      expect_error(
        build(&descriptor(&keys.expressions(), tail), None, &device),
        ErrorKind::UnsupportedDescriptor,
      );
    }
  }

  #[test]
  fn refuses_keys_that_are_not_extended_keys() {
    let keys = VaultKeys::new(&simulator_xprv(), NetworkKind::Test);
    let device = fingerprint_of(&simulator_xprv()).to_string();
    let single = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
    let text = format!(
      "wsh(multi(2,{single},{}/0/*,{}/0/*))",
      keys.device, keys.cloud
    );
    expect_error(
      build(&text, None, &device),
      ErrorKind::UnsupportedDescriptor,
    );
  }

  #[test]
  fn refuses_keys_that_end_in_different_paths() {
    let keys = VaultKeys::new(&simulator_xprv(), NetworkKind::Test);
    let device = fingerprint_of(&simulator_xprv()).to_string();
    let mixed_keychains = format!(
      "wsh(multi(2,{}/0/*,{}/1/*,{}/0/*))",
      keys.device, keys.software, keys.cloud
    );
    expect_error(
      build(&mixed_keychains, None, &device),
      ErrorKind::UnsupportedDescriptor,
    );
    let mixed_forms = format!(
      "wsh(multi(2,{}/0/*,{}/<0;1>/*,{}/0/*))",
      keys.device, keys.software, keys.cloud
    );
    expect_error(
      build(&mixed_forms, None, &device),
      ErrorKind::UnsupportedDescriptor,
    );
  }

  #[test]
  fn refuses_a_device_that_holds_no_key_of_the_vault() {
    let error = expect_error(
      build(&webapp_descriptor("/0/*"), None, "deadbeef"),
      ErrorKind::KeyNotInVault,
    );
    assert!(error.message.contains("deadbeef"), "{}", error.message);
    assert!(error.message.contains("BitBox02"), "{}", error.message);
  }

  #[test]
  fn the_fingerprint_of_the_cloud_key_does_not_match_the_device() {
    // The cloud key has a fingerprint but no path, so it is not a key that a device holds.
    let error = expect_error(
      build(&webapp_descriptor("/0/*"), None, "7737acb8"),
      ErrorKind::KeyNotInVault,
    );
    assert!(error.message.contains("7737acb8"));

    let keys = VaultKeys::new(&simulator_xprv(), NetworkKind::Test);
    expect_error(
      build(
        &descriptor(&keys.expressions(), "/0/*"),
        None,
        CLOUD_FINGERPRINT,
      ),
      ErrorKind::KeyNotInVault,
    );
  }

  #[test]
  fn refuses_a_vault_with_two_keys_of_the_device() {
    let same_device = webapp_descriptor("/0/*").replace("8c24a510/", "dcbf0caf/");
    expect_error(
      build(&same_device, None, "dcbf0caf"),
      ErrorKind::UnsupportedDescriptor,
    );
  }

  #[test]
  fn refuses_duplicate_keys() {
    let duplicated = webapp_descriptor("/0/*").replace(GHOST_MACHINE_XPUB, KEEN_JOIN_XPUB);
    let error = expect_error(
      build(&duplicated, None, "dcbf0caf"),
      ErrorKind::UnsupportedDescriptor,
    );
    assert!(error.message.contains("same key"), "{}", error.message);
  }

  #[test]
  fn refuses_a_change_descriptor_that_is_not_the_twin() {
    let receive = webapp_descriptor("/0/*");
    let device = "dcbf0caf";

    // A different key.
    let other_key = webapp_descriptor("/1/*").replace(GHOST_MACHINE_XPUB, "tpubDDEWE3Rrqmo5JU3whaGqRG63r9qy7jDRaRhz4Hm7SwHUMqWf6RUPFNm2Mqh6JBS7M1wVqY94uJKtBe5jovdJF7mrRsBVjA3MPtS6iy7LkuC");
    // A different threshold.
    let other_threshold = webapp_descriptor("/1/*").replace("multi(2,", "multi(3,");
    // A different order.
    let swapped = format!(
      "wsh(multi(2,[8c24a510/48h/1h/0h/2h]{GHOST_MACHINE_XPUB}/1/*,[7737acb8]{CLOUD_XPUB}/1/*,[dcbf0caf/48h/1h/0h/2h]{KEEN_JOIN_XPUB}/1/*))"
    );
    // A different origin.
    let other_origin =
      webapp_descriptor("/1/*").replace("[8c24a510/48h/1h/0h/2h]", "[8c24a510/48h/1h/1h/2h]");
    // A different fingerprint.
    let other_fingerprint = webapp_descriptor("/1/*").replace("[7737acb8]", "[7737acb9]");
    // Not on the change path.
    let receive_path = webapp_descriptor("/0/*");

    for change in [
      other_key,
      other_threshold,
      swapped,
      other_origin,
      other_fingerprint,
      receive_path,
    ] {
      expect_error(
        build(&receive, Some(&change), device),
        ErrorKind::UnsupportedDescriptor,
      );
    }
  }

  #[test]
  fn refuses_a_change_descriptor_with_a_multipath_receive_descriptor() {
    let error = expect_error(
      build(
        &webapp_descriptor("/<0;1>/*"),
        Some(&webapp_descriptor("/1/*")),
        "dcbf0caf",
      ),
      ErrorKind::UnsupportedDescriptor,
    );
    assert!(error.message.contains("multipath"), "{}", error.message);
  }

  #[test]
  fn refuses_a_change_descriptor_that_is_not_a_vault_descriptor() {
    let sorted = webapp_descriptor("/1/*").replace("multi(", "sortedmulti(");
    expect_error(
      build(&webapp_descriptor("/0/*"), Some(&sorted), "dcbf0caf"),
      ErrorKind::UnsupportedDescriptor,
    );
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
}
