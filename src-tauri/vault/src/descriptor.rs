//! The Swan vault descriptor, read and checked without a device.

use crate::error::{Error, ErrorKind};
use bitcoin::bip32::{ChildNumber, DerivationPath, Fingerprint, Xpub};
use miniscript::descriptor::{DescriptorPublicKey, Wildcard, WshInner};
use miniscript::{Descriptor, Terminal};
use std::str::FromStr;

const RECEIVE: ChildNumber = ChildNumber::Normal { index: 0 };
const CHANGE: ChildNumber = ChildNumber::Normal { index: 1 };

/// One key of a vault descriptor.
#[derive(Debug, Clone, PartialEq)]
pub struct VaultKey {
  /// The origin as the descriptor writes it. A bare `[fingerprint]`, as the Swan cloud key has,
  /// is a fingerprint with an empty path.
  pub origin: Option<(Fingerprint, DerivationPath)>,
  pub xpub: Xpub,
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

/// The vault descriptors, read and checked, before anyone knows which key is the device's.
#[derive(Debug)]
pub struct ParsedVault {
  device_name: &'static str,
  threshold: usize,
  keys: Vec<VaultKey>,
}

/// A vault as one connected device sees it.
#[derive(Debug, Clone)]
pub struct Vault {
  device_name: &'static str,
  /// The number of signatures that spend from the vault.
  pub threshold: usize,
  /// The keys, in descriptor order. The order is part of the vault's script.
  pub keys: Vec<VaultKey>,
  /// Index of the device's key in `keys`.
  pub our_key_index: usize,
  /// Account path of the device's key, for example `m/48'/0'/0'/2'`.
  pub our_account_path: DerivationPath,
}

impl Vault {
  /// The name of the device in the messages, as the device crate gave it.
  pub fn device_name(&self) -> &'static str {
    self.device_name
  }
}

fn unsupported(message: impl Into<String>) -> Error {
  Error::new(ErrorKind::UnsupportedDescriptor, message)
}

/// The last sentences of the messages about a wallet configuration that SVRA refuses.
fn supported(device_name: &str) -> String {
  format!(
    "With a {device_name}, SVRA can sign only for a Swan vault. Paste the wallet configuration from your Swan Vault Recovery Sheet."
  )
}

/// Reads one descriptor. `label` names it in the messages, for example "wallet configuration".
fn parse_descriptor(device_name: &str, text: &str, label: &str) -> Result<ParsedDescriptor, Error> {
  let supported = supported(device_name);
  // The parse error is not shown, because it can repeat what the user pasted.
  let descriptor = Descriptor::<DescriptorPublicKey>::from_str(text.trim()).map_err(|_| {
    unsupported(format!(
      "The {label} is not valid. Check that you copied all of it, including the checksum after the # sign. {supported}"
    ))
  })?;

  let Descriptor::Wsh(wsh) = &descriptor else {
    return Err(unsupported(format!(
      "The {label} does not start with wsh(. {supported}"
    )));
  };
  let miniscript = match wsh.as_inner() {
    WshInner::Ms(miniscript) => miniscript,
    WshInner::SortedMulti(_) => {
      return Err(unsupported(format!(
        "The {label} uses sortedmulti(). A Swan vault does not sort its keys, so SVRA cannot sign it. {supported}"
      )))
    }
  };
  let Terminal::Multi(threshold) = &miniscript.node else {
    return Err(unsupported(format!(
      "The {label} does not use multi(). {supported}"
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
        "Key {} of the {label} is not an extended public key that ends in /0/*, /1/* or /<0;1>/*. {supported}",
        index + 1
      ))
    })?;
    match keychain {
      None => keychain = Some(this_keychain),
      Some(first) if first == this_keychain => {}
      Some(_) => {
        return Err(unsupported(format!(
          "The keys of the {label} do not all end in the same path. {supported}"
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

/// Reads the wallet configuration, and the change configuration when there is one, and checks
/// that they describe one vault.
///
/// `device_name` is how the messages name the device, for example "BitBox02". It also ends up in
/// the messages that the later checks give.
pub fn parse_vault(
  device_name: &'static str,
  receive_descriptor: &str,
  change_descriptor: Option<&str>,
) -> Result<ParsedVault, Error> {
  let receive = parse_descriptor(device_name, receive_descriptor, "wallet configuration")?;
  if receive.keychain == Keychain::Change {
    return Err(unsupported(
      "The wallet configuration ends in /1/*, which is the path of the change configuration. Paste the wallet configuration from your Swan Vault Recovery Sheet. It ends in /0/*.",
    ));
  }

  if let Some(change_descriptor) = change_descriptor {
    if receive.keychain == Keychain::Multipath {
      return Err(unsupported(
        "The wallet configuration is a multipath configuration, so it already holds the change path. Leave the change configuration empty.",
      ));
    }
    let change = parse_descriptor(device_name, change_descriptor, "change configuration")?;
    if change.keychain != Keychain::Change {
      return Err(unsupported(
        "The change configuration must end in /1/*. Paste the change configuration from your Swan Vault Recovery Sheet.",
      ));
    }
    if change.threshold != receive.threshold || change.keys != receive.keys {
      return Err(unsupported(
        "The change configuration is not from the same vault as the wallet configuration. Leave it empty, or paste the one from the same Recovery Sheet.",
      ));
    }
  }

  let mut seen = Vec::new();
  for key in &receive.keys {
    let identity = (key.xpub.public_key, key.xpub.chain_code);
    if seen.contains(&identity) {
      return Err(unsupported(
        "Two keys of the wallet configuration are the same key. A vault needs different keys.",
      ));
    }
    seen.push(identity);
  }

  Ok(ParsedVault {
    device_name,
    threshold: receive.threshold,
    keys: receive.keys,
  })
}

impl ParsedVault {
  /// The number of signatures that spend from the vault.
  pub fn threshold(&self) -> usize {
    self.threshold
  }

  /// The keys, in descriptor order.
  pub fn keys(&self) -> &[VaultKey] {
    &self.keys
  }

  /// Finds the connected device's key. `our_root_fingerprint` is the fingerprint of the device's
  /// master key.
  pub fn for_device(self, our_root_fingerprint: Fingerprint) -> Result<Vault, Error> {
    let device_name = self.device_name;
    // The cloud key has a fingerprint and no path, so it never matches, even when its fingerprint
    // equals the device's.
    let ours: Vec<(usize, &DerivationPath)> = self
      .keys
      .iter()
      .enumerate()
      .filter_map(|(index, key)| match &key.origin {
        Some((fingerprint, path))
          if *fingerprint == our_root_fingerprint && !path.as_ref().is_empty() =>
        {
          Some((index, path))
        }
        _ => None,
      })
      .collect();
    let (our_key_index, our_account_path) = match ours.as_slice() {
      [(index, path)] => (*index, (*path).clone()),
      [] => {
        return Err(Error::new(
          ErrorKind::KeyNotInVault,
          format!(
            "The connected {device_name} (fingerprint {our_root_fingerprint}) does not hold a key of this vault. Connect the {device_name} that holds one of the vault keys. A {device_name} with the optional passphrase has a different key for each passphrase, so check the passphrase. To sign with another device, unplug this {device_name}."
          ),
        ))
      }
      _ => {
        return Err(unsupported(format!(
          "More than one key of this vault belongs to the connected {device_name}. SVRA cannot sign this vault with one device."
        )))
      }
    };

    Ok(Vault {
      device_name,
      threshold: self.threshold,
      keys: self.keys,
      our_key_index,
      our_account_path,
    })
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::test_support::{
    descriptor, fingerprint_of, simulator_xprv, webapp_keys, VaultKeys, CLOUD_FINGERPRINT, ORDERS,
    WEBAPP_CLOUD_XPUB as CLOUD_XPUB, WEBAPP_GHOST_MACHINE_XPUB as GHOST_MACHINE_XPUB,
    WEBAPP_KEEN_JOIN_XPUB as KEEN_JOIN_XPUB,
  };
  use bitcoin::NetworkKind;

  const DEVICE: &str = "Test device";

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

  fn build_for(receive: &str, change: Option<&str>, device: Fingerprint) -> Result<Vault, Error> {
    parse_vault(DEVICE, receive, change)?.for_device(device)
  }

  fn build(receive: &str, change: Option<&str>, device: &str) -> Result<Vault, Error> {
    build_for(receive, change, fingerprint(device))
  }

  fn expect_error(result: Result<Vault, Error>, kind: ErrorKind) -> Error {
    match result {
      Ok(_) => panic!("the vault was parsed, but it should fail with {kind:?}"),
      Err(error) => {
        assert_eq!(error.kind, kind, "{}", error.message);
        error
      }
    }
  }

  const TESTNET_ACCOUNT: [u32; 4] = [0x8000_0030, 0x8000_0001, 0x8000_0000, 0x8000_0002];

  #[test]
  fn reads_the_webapp_vault_with_its_checksum() {
    let descriptor = format!("{}#scfc2wh5", webapp_descriptor("/0/*"));
    let vault = build(&descriptor, None, "dcbf0caf").expect("the vault is read");
    assert_eq!(vault.threshold, 2);
    assert_eq!(vault.our_key_index, 2);
    assert_eq!(vault.our_account_path.to_u32_vec(), TESTNET_ACCOUNT);
    assert_eq!(vault.device_name(), DEVICE);
  }

  #[test]
  fn keeps_descriptor_order_and_finds_the_device_wherever_it_is() {
    for (device, index) in [("8c24a510", 1), ("dcbf0caf", 2)] {
      let vault = build(&webapp_descriptor("/0/*"), None, device).expect("the vault is read");
      assert_eq!(vault.our_key_index, index);
      let xpubs: Vec<Xpub> = vault.keys.iter().map(|key| key.xpub).collect();
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
  fn the_parsed_vault_lists_the_keys_and_the_threshold_before_a_device_is_known() {
    let parsed = parse_vault(DEVICE, &webapp_descriptor("/0/*"), None).expect("parsed");
    assert_eq!(parsed.threshold(), 2);
    assert_eq!(parsed.keys().len(), 3);
    assert_eq!(
      parsed.keys()[0].origin,
      Some((fingerprint("7737acb8"), DerivationPath::master()))
    );
    assert_eq!(parsed.keys()[1].xpub, xpub(GHOST_MACHINE_XPUB));
  }

  #[test]
  fn reads_a_fingerprint_in_the_descriptor_in_upper_case() {
    // The device reports its fingerprint in lower case. The descriptor is what the user pasted.
    let descriptor = webapp_descriptor("/0/*").replace("[dcbf0caf/", "[DCBF0CAF/");
    assert!(descriptor.contains("[DCBF0CAF/"));
    let vault = build(&descriptor, None, "dcbf0caf").expect("the vault is read");
    assert_eq!(vault.our_key_index, 2);
    assert_eq!(
      vault.keys[2]
        .origin
        .as_ref()
        .map(|(fingerprint, _)| *fingerprint),
      Some(fingerprint("dcbf0caf"))
    );
  }

  #[test]
  fn accepts_apostrophes_and_h_for_hardened_steps() {
    let with_h = webapp_descriptor("/0/*");
    let with_apostrophe = with_h.replace("h/", "'/").replace("h]", "']");
    let from_h = build(&with_h, None, "dcbf0caf").expect("h");
    let from_apostrophe = build(&with_apostrophe, None, "dcbf0caf").expect("apostrophe");
    assert_eq!(from_h.keys, from_apostrophe.keys);
    assert_eq!(from_h.our_account_path, from_apostrophe.our_account_path);
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
    assert_eq!(a.keys, b.keys);
    assert_eq!(a.threshold, b.threshold);
  }

  #[test]
  fn accepts_a_multipath_descriptor() {
    let vault = build(&webapp_descriptor("/<0;1>/*"), None, "dcbf0caf").expect("multipath");
    assert_eq!(vault.keys.len(), 3);
    assert_eq!(vault.our_key_index, 2);
  }

  #[test]
  fn accepts_a_receive_and_a_change_descriptor() {
    let receive = webapp_descriptor("/0/*");
    let change = webapp_descriptor("/1/*");
    let both = build(&receive, Some(&change), "dcbf0caf").expect("receive and change");
    let receive_only = build(&receive, None, "dcbf0caf").expect("receive only");
    assert_eq!(both.keys, receive_only.keys);
    assert_eq!(both.threshold, receive_only.threshold);
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
        let vault =
          build_for(&descriptor(&ordered, "/0/*"), None, device).expect("the vault is read");
        let device_position = order
          .iter()
          .position(|position| *position == 0)
          .expect("device");
        let cloud_position = order
          .iter()
          .position(|position| *position == 2)
          .expect("cloud");
        assert_eq!(vault.our_key_index, device_position);
        assert_eq!(
          vault.our_account_path.to_u32_vec(),
          vec![0x8000_0030, 0x8000_0000 + coin, 0x8000_0000, 0x8000_0002]
        );
        assert_eq!(
          vault.keys[cloud_position].origin,
          Some((fingerprint(CLOUD_FINGERPRINT), DerivationPath::master()))
        );
        assert_eq!(
          vault.keys[device_position]
            .origin
            .as_ref()
            .map(|(fingerprint, _)| *fingerprint),
          Some(device)
        );
      }
    }
  }

  #[test]
  fn reads_the_threshold_and_the_key_count_from_the_descriptor() {
    let keys = VaultKeys::new(&simulator_xprv(), NetworkKind::Test);
    let [device, software, cloud] = keys.expressions();
    let two_of_two = format!("wsh(multi(2,{device}/0/*,{cloud}/0/*))");
    let vault =
      build_for(&two_of_two, None, fingerprint_of(&simulator_xprv())).expect("two of two");
    assert_eq!((vault.threshold, vault.keys.len()), (2, 2));

    let one_of_three = format!("wsh(multi(1,{device}/0/*,{software}/0/*,{cloud}/0/*))");
    let vault =
      build_for(&one_of_three, None, fingerprint_of(&simulator_xprv())).expect("one of three");
    assert_eq!((vault.threshold, vault.keys.len()), (1, 3));
  }

  #[test]
  fn a_key_with_a_bare_fingerprint_origin_has_an_empty_path() {
    let vault = build(&webapp_descriptor("/0/*"), None, "dcbf0caf").expect("built");
    assert_eq!(
      vault.keys[0].origin,
      Some((fingerprint("7737acb8"), DerivationPath::master()))
    );
    assert_eq!(
      vault.keys[2].origin,
      Some((
        fingerprint("dcbf0caf"),
        DerivationPath::from_str("m/48'/1'/0'/2'").expect("a path")
      ))
    );
  }

  #[test]
  fn the_messages_name_the_device_that_the_caller_gave() {
    let sorted = webapp_descriptor("/0/*").replace("multi(", "sortedmulti(");
    let error = parse_vault("Trezor Safe 7", &sorted, None).expect_err("sortedmulti is refused");
    assert!(
      error
        .message
        .ends_with("With a Trezor Safe 7, SVRA can sign only for a Swan vault. Paste the wallet configuration from your Swan Vault Recovery Sheet."),
      "{}",
      error.message
    );

    let parsed = parse_vault("Trezor Safe 7", &webapp_descriptor("/0/*"), None).expect("parsed");
    let error = parsed
      .for_device(fingerprint("deadbeef"))
      .expect_err("no key");
    assert_eq!(error.kind, ErrorKind::KeyNotInVault);
    assert!(
      error
        .message
        .starts_with("The connected Trezor Safe 7 (fingerprint deadbeef) does not hold"),
      "{}",
      error.message
    );
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
  fn refuses_a_single_key() {
    let keys = VaultKeys::new(&simulator_xprv(), NetworkKind::Test);
    let one = format!("wsh(multi(1,{}/0/*))", keys.device);
    expect_error(
      build_for(&one, None, fingerprint_of(&simulator_xprv())),
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
        build_for(&text, None, fingerprint_of(&simulator_xprv())),
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
    assert!(error.message.contains("/1/*"), "{}", error.message);
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
    assert!(error.message.contains("passphrase"), "{}", error.message);
    assert!(error.message.contains("unplug"), "{}", error.message);
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
}
