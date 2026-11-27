//! Swan vault fixtures for the unit tests: keys, descriptors, a funded wallet, the sweep PSBT that
//! SVRA builds, and a software signer that stands in for a device. The unit tests include this
//! file with a `#[path]` attribute.
// The tests use different parts of this file.
#![allow(dead_code)]

use bdk_wallet::{KeychainKind, Wallet};
use bitcoin::absolute::LockTime;
use bitcoin::bip32::{DerivationPath, Fingerprint, Xpriv, Xpub};
use bitcoin::hashes::Hash;
use bitcoin::psbt::Psbt;
use bitcoin::secp256k1::{self, Message, Secp256k1};
use bitcoin::sighash::{EcdsaSighashType, SighashCache};
use bitcoin::{
  ecdsa, transaction, Amount, FeeRate, Network, NetworkKind, OutPoint, PublicKey, ScriptBuf,
  Sequence, Transaction, TxIn, TxOut, Txid, Witness,
};
use miniscript::descriptor::DescriptorPublicKey;
use miniscript::Descriptor;
use std::str::FromStr;

/// BIP32 xprv of the mnemonic that the vendor's firmware simulator uses:
/// boring mistake dish oyster truth pigeon viable emerge sort crash wire portion cannon couple
/// enact box walk height pull today solid off enable tide
/// Source: `tests/util/mod.rs` of `bitbox-api` 0.13.0.
pub const SIMULATOR_BIP32_XPRV: &str = "xprv9s21ZrQH143K2qxpAMxVdyeza5dUBxY11XbJ7eKvRF51sQyhiFXgmn4P4ALi3Nf6bcG8cmPDvMMEFiAVjtXsqeZ47PJfBJif7uSYycMsx9c";

/// The fingerprint that Swan's descriptors give the cloud key.
pub const CLOUD_FINGERPRINT: &str = "cccccccc";

pub fn simulator_xprv() -> Xpriv {
  SIMULATOR_BIP32_XPRV
    .parse()
    .expect("the simulator xprv is valid")
}

/// A master key from a seed byte, so that every test key is the same on every run.
pub fn master_key(seed_byte: u8, kind: NetworkKind) -> Xpriv {
  Xpriv::new_master(kind, &[seed_byte; 32]).expect("a 32 byte seed is valid")
}

pub fn fingerprint_of(xprv: &Xpriv) -> Fingerprint {
  xprv.fingerprint(&Secp256k1::new())
}

/// The testnet vault of the webapp's `buildBitboxPolicy.test.ts`, so that both implementations are
/// tested on the same input. The cloud key comes first, because the position follows the BitGo
/// key roles and nothing may assume that the cloud key is last.
pub const WEBAPP_CLOUD_XPUB: &str = "tpubD6NzVbkrYhZ4X3vCdevm3aFUdeSAWsbR4UhhdApbXnVUnvuwtq5NYqQ7zCkNhYG4JcPdGW4Wg4ZrVSYGpdoWsn337qmkP6CFgs7pZid12Sa";
pub const WEBAPP_GHOST_MACHINE_XPUB: &str = "tpubDDzWqfZ5TH48383Byd9PFGxEP1Ws5NVXyYcHTmnHwmhJciowLeBDWNHcpLGocofanSyVHeiNqL4HZkXZfKM7NKm7gZZoPjmA9vTKPpwRSkx";
pub const WEBAPP_KEEN_JOIN_XPUB: &str = "tpubDFd7VxopNeZg93uqR7CSvJLkw3UanF8rywdQTxhCPFt1P33eZkxJJ91XXEbY2Q4Suw3jyscRwGzjVyfgq97N7sRvPHQVxruHwsKvsvQizSk";

/// The three keys of that vault as `[cloud, ghost machine, keen join]` key expressions with `tail`
/// after each. The cloud key has no path, and the two customer keys are on `m/48'/1'/0'/2'`.
pub fn webapp_keys(tail: &str) -> [String; 3] {
  [
    format!("[7737acb8]{WEBAPP_CLOUD_XPUB}{tail}"),
    format!("[8c24a510/48h/1h/0h/2h]{WEBAPP_GHOST_MACHINE_XPUB}{tail}"),
    format!("[dcbf0caf/48h/1h/0h/2h]{WEBAPP_KEEN_JOIN_XPUB}{tail}"),
  ]
}

/// The path of the account key of a Swan vault device: `m/48'/<coin>'/0'/2'`.
pub fn account_path(kind: NetworkKind) -> DerivationPath {
  let coin = if kind == NetworkKind::Main { 0 } else { 1 };
  format!("m/48'/{coin}'/0'/2'")
    .parse()
    .expect("the account path is valid")
}

/// Writes an xpub as an xpub on mainnet and as a tpub elsewhere. A key derived from a key of
/// one kind keeps that kind, so the kind is set here.
pub fn xpub_string(xpub: &Xpub, kind: NetworkKind) -> String {
  let mut xpub = *xpub;
  xpub.network = kind;
  xpub.to_string()
}

/// The three keys of a vault, as key expressions without the `/0/*` tail.
pub struct VaultKeys {
  /// `[<fingerprint>/48'/<coin>'/0'/2']<xpub>` of the device.
  pub device: String,
  /// The same for the second customer key, which has a private key in the test.
  pub software: String,
  /// `[cccccccc]<xpub>`: a fingerprint without a path, at depth 0, as the Swan cloud key is.
  pub cloud: String,
  pub device_xprv: Xpriv,
  pub software_xprv: Xpriv,
  pub cloud_xprv: Xpriv,
  pub kind: NetworkKind,
}

impl VaultKeys {
  pub fn new(device_master: &Xpriv, kind: NetworkKind) -> VaultKeys {
    let secp = Secp256k1::new();
    let software_master = master_key(0x42, kind);
    let cloud_master = master_key(0x43, kind);
    let path = account_path(kind);

    let origin_key = |master: &Xpriv| {
      let account = master
        .derive_priv(&secp, &path)
        .expect("the account derives");
      format!(
        "[{}/{}]{}",
        master.fingerprint(&secp),
        path,
        xpub_string(&Xpub::from_priv(&secp, &account), kind)
      )
    };
    VaultKeys {
      device: origin_key(device_master),
      software: origin_key(&software_master),
      cloud: format!(
        "[{CLOUD_FINGERPRINT}]{}",
        xpub_string(&Xpub::from_priv(&secp, &cloud_master), kind)
      ),
      device_xprv: *device_master,
      software_xprv: software_master,
      cloud_xprv: cloud_master,
      kind,
    }
  }

  /// The three expressions, as `[device, software, cloud]`.
  pub fn expressions(&self) -> [&str; 3] {
    [&self.device, &self.software, &self.cloud]
  }
}

/// `wsh(multi(2,...))` over the key expressions in the given order, with the given tail after
/// each key, and the checksum added.
pub fn descriptor(keys: &[&str], tail: &str) -> String {
  let body: Vec<String> = keys.iter().map(|key| format!("{key}{tail}")).collect();
  let text = format!("wsh(multi(2,{}))", body.join(","));
  Descriptor::<DescriptorPublicKey>::from_str(&text)
    .expect("the descriptor parses")
    .to_string()
}

/// Every order of three items.
pub const ORDERS: [[usize; 3]; 6] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

/// The public key of the vault key at `/<keychain>/<index>`. The key expression names the key.
fn derived_key(key: &str, keychain: u32, index: u32) -> secp256k1::PublicKey {
  let secp = Secp256k1::new();
  let key = DescriptorPublicKey::from_str(&format!("{key}/*")).expect("the key parses");
  let DescriptorPublicKey::XPub(key) = key else {
    panic!("the key is an extended key");
  };
  let steps = [
    bitcoin::bip32::ChildNumber::from_normal_idx(keychain).expect("normal"),
    bitcoin::bip32::ChildNumber::from_normal_idx(index).expect("normal"),
  ];
  key
    .xkey
    .derive_pub(&secp, &steps)
    .expect("the key derives")
    .public_key
}

/// The first order of the keys whose multisig is not in BIP-67 order at the first two receive
/// addresses and the first change address, which are the addresses that the tests fund. A
/// `sortedmulti` descriptor over the same keys would be a different wallet at each of them.
/// `device_slot` limits the choice to the orders that put the device key (key 0) at that
/// position.
pub fn unsorted_order(keys: &VaultKeys, device_slot: Option<usize>) -> [usize; 3] {
  let expressions = keys.expressions();
  let addresses = [(0, 0), (0, 1), (1, 0)];
  ORDERS
    .into_iter()
    .filter(|order| device_slot.is_none_or(|slot| order[slot] == 0))
    .find(|order| {
      addresses.iter().all(|(keychain, index)| {
        let in_order: Vec<[u8; 33]> = order
          .iter()
          .map(|position| derived_key(expressions[*position], *keychain, *index).serialize())
          .collect();
        let mut sorted = in_order.clone();
        sorted.sort();
        in_order != sorted
      })
    })
    .expect("one of the orders is unsorted at every funded address")
}

/// A vault wallet with funds, and everything needed to build and sign a sweep.
pub struct Vault {
  pub network: Network,
  pub keys: VaultKeys,
  /// The order of `[device, software, cloud]` in the descriptor.
  pub order: [usize; 3],
  pub receive_descriptor: String,
  pub change_descriptor: String,
  pub multipath_descriptor: String,
  pub wallet: Wallet,
  pub device_fingerprint: Fingerprint,
}

impl Vault {
  /// A vault of the device with the master key `device_master`, a software key and a cloud key,
  /// in an order that differs from the sorted order, with two receive and one change UTXO. The
  /// keys are xpubs on mainnet and tpubs on every other network.
  pub fn new(device_master: &Xpriv, network: Network) -> Vault {
    Vault::build(device_master, network, None)
  }

  /// Like [`Vault::new`], with the key of the device at position `device_slot` (0 to 2) of the
  /// descriptor.
  pub fn with_device_at(device_master: &Xpriv, network: Network, device_slot: usize) -> Vault {
    Vault::build(device_master, network, Some(device_slot))
  }

  fn build(device_master: &Xpriv, network: Network, device_slot: Option<usize>) -> Vault {
    let keys = VaultKeys::new(device_master, NetworkKind::from(network));
    let order = unsorted_order(&keys, device_slot);
    let expressions = keys.expressions();
    let ordered: Vec<&str> = order
      .iter()
      .map(|position| expressions[*position])
      .collect();
    let receive_descriptor = descriptor(&ordered, "/0/*");
    let change_descriptor = descriptor(&ordered, "/1/*");
    let multipath_descriptor = descriptor(&ordered, "/<0;1>/*");

    let mut wallet = Wallet::create(receive_descriptor.clone(), change_descriptor.clone())
      .network(network)
      .create_wallet_no_persist()
      .expect("the wallet is created");

    let external_0 = wallet
      .reveal_next_address(KeychainKind::External)
      .script_pubkey();
    let external_1 = wallet
      .reveal_next_address(KeychainKind::External)
      .script_pubkey();
    let internal_0 = wallet
      .reveal_next_address(KeychainKind::Internal)
      .script_pubkey();
    for (seed, script, sats) in [
      (0x51_u8, external_0, 100_000_u64),
      (0x52, external_1, 80_000),
      (0x53, internal_0, 50_000),
    ] {
      wallet.apply_unconfirmed_txs([(funding_transaction(seed, script, sats), 1_700_000_000_u64)]);
    }

    Vault {
      network,
      device_fingerprint: fingerprint_of(device_master),
      keys,
      order,
      receive_descriptor,
      change_descriptor,
      multipath_descriptor,
      wallet,
    }
  }

  /// The PSBT of SVRA's sweep command: drain the wallet to one address.
  pub fn sweep_psbt(&mut self) -> Psbt {
    let secp = Secp256k1::new();
    let destination_key = PublicKey::new(self.keys.software_xprv.private_key.public_key(&secp));
    let mut builder = self.wallet.build_tx();
    builder.drain_wallet();
    builder.drain_to(ScriptBuf::new_p2wpkh(
      &destination_key.wpubkey_hash().expect("compressed key"),
    ));
    builder.fee_rate(FeeRate::from_sat_per_vb(2).expect("a fee rate"));
    builder.finish().expect("the sweep is built")
  }
}

/// A transaction that pays `sats` to `script`. Its input spends an output that does not exist,
/// which is fine because nothing here validates the funding transaction.
pub fn funding_transaction(seed: u8, script: ScriptBuf, sats: u64) -> Transaction {
  Transaction {
    version: transaction::Version::TWO,
    lock_time: LockTime::ZERO,
    input: vec![TxIn {
      previous_output: OutPoint {
        txid: Txid::from_byte_array([seed; 32]),
        vout: 0,
      },
      script_sig: ScriptBuf::new(),
      sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
      witness: Witness::new(),
    }],
    output: vec![TxOut {
      value: Amount::from_sat(sats),
      script_pubkey: script,
    }],
  }
}

/// Signs every input with the key of `master`, as a device with that key does: for each input
/// it finds the key of its fingerprint, derives the private key at the PSBT's path and adds a
/// SIGHASH_ALL signature over the BIP-143 hash.
pub fn sign_with(master: &Xpriv, psbt: &mut Psbt) {
  let secp = Secp256k1::new();
  let fingerprint = fingerprint_of(master);
  let transaction = psbt.unsigned_tx.clone();
  let mut cache = SighashCache::new(&transaction);
  for index in 0..psbt.inputs.len() {
    let amount = psbt.spend_utxo(index).expect("the input has a utxo").value;
    let input = &mut psbt.inputs[index];
    let (public_key, path) = input
      .bip32_derivation
      .iter()
      .find(|(_, (key_fingerprint, _))| *key_fingerprint == fingerprint)
      .map(|(public_key, (_, path))| (*public_key, path.clone()))
      .expect("the input has a key of the signer");
    let private_key = master
      .derive_priv(&secp, &path)
      .expect("the path derives")
      .private_key;
    assert_eq!(private_key.public_key(&secp), public_key);
    let witness_script = input.witness_script.as_ref().expect("a witness script");
    let sighash = cache
      .p2wsh_signature_hash(index, witness_script, amount, EcdsaSighashType::All)
      .expect("the hash is computed");
    let signature = secp.sign_ecdsa(&Message::from_digest(sighash.to_byte_array()), &private_key);
    input.partial_sigs.insert(
      PublicKey::new(public_key),
      ecdsa::Signature {
        signature,
        sighash_type: EcdsaSighashType::All,
      },
    );
  }
}
