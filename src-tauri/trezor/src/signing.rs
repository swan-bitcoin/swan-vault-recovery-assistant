//! The signing conversation. The app sends `SignTx` with the counts of the transaction, and the
//! device then asks for each input and each output, and for each previous transaction that an
//! input spends, one request at a time. It sends one signature for each input along the way.
//!
//! The device keeps no wallet. Every input carries the three keys of the vault in the order of the
//! descriptor, and the path that leads from them to the key of the address. The device checks
//! that one of the three keys is its own. Every output is a payment to an address.

use crate::device::Device;
use crate::device_error::{unexpected_message, Step};
use crate::error::{Error, ErrorKind};
use crate::keys::path_numbers;
use crate::link::QUICK;
use crate::proto::{
  HdNodeType, InputScriptType, MultisigPubkeysOrder, MultisigRedeemScriptType, OutputScriptType,
  PrevInput, PrevOutput, PrevTx, RequestType, SignTx, TxAckInput, TxAckInputWrapper, TxAckOutput,
  TxAckOutputWrapper, TxAckPrevInput, TxAckPrevInputWrapper, TxAckPrevMeta, TxAckPrevOutput,
  TxAckPrevOutputWrapper, TxInput, TxOutput, TxRequest,
};
use crate::session::Progress;
use crate::transport::Transport;
use bitcoin::bip32::ChildNumber;
use bitcoin::psbt::Psbt;
use bitcoin::secp256k1::{self, ecdsa::Signature as RawSignature};
use bitcoin::sighash::EcdsaSighashType;
use bitcoin::{ecdsa, Address, Network, PublicKey, Transaction, Txid};
use std::collections::{BTreeMap, HashMap};
use svra_vault::{address_steps, vault_public_key, Vault};

/// The fewest requests that a signing may take. A small transaction has a few dozen.
const MIN_ROUND_LIMIT: usize = 128;

/// A transaction hash as the device writes it: the bytes of the hex string that block explorers
/// show, which is the reverse of the order in the serialized transaction.
type WireHash = [u8; 32];

fn wire_hash(txid: Txid) -> WireHash {
  use bitcoin::hashes::Hash;
  let mut bytes = txid.to_byte_array();
  bytes.reverse();
  bytes
}

fn invalid(message: impl Into<String>) -> Error {
  Error::new(ErrorKind::InvalidPsbt, message)
}

/// What the app sends to the device, built from the PSBT before the device sees anything.
pub(crate) struct Plan {
  sign_tx: SignTx,
  inputs: Vec<TxInput>,
  outputs: Vec<TxOutput>,
  previous: HashMap<WireHash, Transaction>,
  /// The device's key for each input.
  keys: Vec<secp256k1::PublicKey>,
  /// The most requests that a device that behaves may send.
  round_limit: usize,
}

/// The node of an extended key as the device wants it.
fn node(key: &bitcoin::bip32::Xpub) -> HdNodeType {
  HdNodeType {
    depth: u32::from(key.depth),
    fingerprint: u32::from_be_bytes(key.parent_fingerprint.to_bytes()),
    child_num: u32::from(key.child_number),
    chain_code: key.chain_code.to_bytes().to_vec(),
    public_key: key.public_key.serialize().to_vec(),
  }
}

/// The multisig structure of one address of the vault. `signatures` has one slot for each key,
/// in the order of the descriptor, and an empty slot for a key that has not signed.
fn multisig(
  vault: &Vault,
  steps: &[ChildNumber; 2],
  signatures: Vec<Vec<u8>>,
) -> MultisigRedeemScriptType {
  MultisigRedeemScriptType {
    signatures,
    m: vault.threshold as u32,
    nodes: vault.keys.iter().map(|key| node(&key.xpub)).collect(),
    address_n: steps.iter().map(|step| u32::from(*step)).collect(),
    // The order of the keys is part of the vault's script, so the device must not sort them.
    pubkeys_order: Some(MultisigPubkeysOrder::Preserved as i32),
  }
}

/// The signatures that an input already holds, in the slot of the key that made each one. A
/// signature of a key that is not in the vault, or one that does not use SIGHASH_ALL, stops the
/// signing, because the device cannot place it.
fn signature_slots(
  vault: &Vault,
  steps: &[ChildNumber; 2],
  partial_sigs: &BTreeMap<PublicKey, ecdsa::Signature>,
  index: usize,
) -> Result<Vec<Vec<u8>>, Error> {
  let mut slots = vec![Vec::new(); vault.keys.len()];
  let mut placed = 0;
  for (position, slot) in slots.iter_mut().enumerate() {
    let key = vault_public_key(vault, position, steps)
      .ok_or_else(|| invalid(format!("Input {index} does not belong to the vault.")))?;
    if let Some(signature) = partial_sigs.get(&PublicKey::new(key)) {
      if position == vault.our_key_index {
        return Err(invalid(format!(
          "Input {index} holds a signature of this {} that SVRA cannot use. Either another input has none, or this one is not valid. Create the transaction again with SVRA.",
          vault.device_name()
        )));
      }
      if signature.sighash_type != EcdsaSighashType::All {
        return Err(invalid(format!(
          "Input {index} holds a signature that does not cover the whole transaction, so the {} cannot sign it.",
          vault.device_name()
        )));
      }
      *slot = signature.signature.serialize_der().to_vec();
      placed += 1;
    }
  }
  if placed != partial_sigs.len() {
    return Err(invalid(format!(
      "Input {index} holds a signature of a key that is not in this vault."
    )));
  }
  Ok(slots)
}

/// Builds everything that the device asks for during the signing, from a PSBT that
/// [`svra_vault::precheck`] accepted.
pub(crate) fn prepare(
  psbt: &Psbt,
  vault: &Vault,
  keys: &[secp256k1::PublicKey],
  network: Network,
  coin: &str,
) -> Result<Plan, Error> {
  let transaction = &psbt.unsigned_tx;
  if keys.len() != transaction.input.len() || psbt.inputs.len() != transaction.input.len() {
    return Err(invalid("The transaction has inputs without data."));
  }
  let mut previous = HashMap::new();
  let mut round_limit = MIN_ROUND_LIMIT + 8 * (transaction.input.len() + transaction.output.len());
  let mut inputs = Vec::with_capacity(transaction.input.len());
  for (index, (tx_in, key)) in transaction.input.iter().zip(keys).enumerate() {
    let input = &psbt.inputs[index];
    let missing = || {
      invalid(format!(
        "Input {index} lacks the data that the Trezor Safe 7 needs."
      ))
    };
    let (_, path) = input.bip32_derivation.get(key).ok_or_else(missing)?;
    let steps = address_steps(vault, path).ok_or_else(missing)?;
    let source = input.non_witness_utxo.as_ref().ok_or_else(missing)?;
    let amount = usize::try_from(tx_in.previous_output.vout)
      .ok()
      .and_then(|vout| source.output.get(vout))
      .ok_or_else(missing)?
      .value
      .to_sat();
    let signatures = signature_slots(vault, &steps, &input.partial_sigs, index)?;
    inputs.push(TxInput {
      address_n: path_numbers(path),
      prev_hash: wire_hash(source.compute_txid()).to_vec(),
      prev_index: tx_in.previous_output.vout,
      sequence: Some(tx_in.sequence.0),
      script_type: Some(InputScriptType::SpendWitness as i32),
      multisig: Some(multisig(vault, &steps, signatures)),
      amount,
    });
    round_limit += 8 * (1 + source.input.len() + source.output.len());
    previous.insert(wire_hash(source.compute_txid()), source.clone());
  }

  // Every output goes to the device as a payment to an address, also one that returns to the
  // vault. The device does not show an output that it knows as change, and a PSBT that someone
  // edited can hide the whole vault in such an output. A payment is always on the screen.
  let mut outputs = Vec::with_capacity(transaction.output.len());
  for (index, tx_out) in transaction.output.iter().enumerate() {
    let address = Address::from_script(&tx_out.script_pubkey, network).map_err(|_| {
      invalid(format!(
        "Output {index} pays to a script that the Trezor Safe 7 cannot show as an address, so it cannot sign the transaction."
      ))
    })?;
    outputs.push(TxOutput {
      address: Some(address.to_string()),
      amount: tx_out.value.to_sat(),
      script_type: Some(OutputScriptType::PayToAddress as i32),
    });
  }

  Ok(Plan {
    sign_tx: SignTx {
      outputs_count: u32::try_from(outputs.len())
        .map_err(|_| invalid("The transaction has too many outputs."))?,
      inputs_count: u32::try_from(inputs.len())
        .map_err(|_| invalid("The transaction has too many inputs."))?,
      coin_name: Some(coin.to_string()),
      version: Some(transaction.version.0 as u32),
      lock_time: Some(transaction.lock_time.to_consensus_u32()),
      // The app wants the signatures. It builds and checks the transaction itself.
      serialize: Some(false),
    },
    inputs,
    outputs,
    previous,
    keys: keys.to_vec(),
    round_limit,
  })
}

/// What the app sends back for one request of the device.
pub(crate) enum Answer {
  Input(TxAckInput),
  Output(TxAckOutput),
  PrevMeta(TxAckPrevMeta),
  PrevInput(TxAckPrevInput),
  PrevOutput(TxAckPrevOutput),
  /// The device has no more requests.
  Finished,
}

fn bad_request() -> Error {
  unexpected_message()
}

impl Plan {
  /// Answers one request of the device. Every index and every hash comes from the device, so each
  /// one is checked.
  pub(crate) fn answer(&self, request: &TxRequest) -> Result<Answer, Error> {
    let request_type = request
      .request_type
      .and_then(|value| RequestType::try_from(value).ok())
      .ok_or_else(bad_request)?;
    if request_type == RequestType::Finished {
      return Ok(Answer::Finished);
    }
    let details = request.details.as_ref().ok_or_else(bad_request)?;
    let previous = match &details.tx_hash {
      None => None,
      Some(hash) => {
        let hash: WireHash = hash.as_slice().try_into().map_err(|_| bad_request())?;
        Some(self.previous.get(&hash).ok_or_else(bad_request)?)
      }
    };
    let index = || {
      details
        .request_index
        .and_then(|index| usize::try_from(index).ok())
        .ok_or_else(bad_request)
    };
    Ok(match (request_type, previous) {
      (RequestType::Meta, Some(previous)) => Answer::PrevMeta(TxAckPrevMeta {
        tx: PrevTx {
          version: previous.version.0 as u32,
          lock_time: previous.lock_time.to_consensus_u32(),
          inputs_count: u32::try_from(previous.input.len()).map_err(|_| bad_request())?,
          outputs_count: u32::try_from(previous.output.len()).map_err(|_| bad_request())?,
        },
      }),
      (RequestType::Input, Some(previous)) => {
        let input = previous.input.get(index()?).ok_or_else(bad_request)?;
        Answer::PrevInput(TxAckPrevInput {
          tx: TxAckPrevInputWrapper {
            input: PrevInput {
              prev_hash: wire_hash(input.previous_output.txid).to_vec(),
              prev_index: input.previous_output.vout,
              script_sig: input.script_sig.to_bytes(),
              sequence: input.sequence.0,
            },
          },
        })
      }
      (RequestType::Output, Some(previous)) => {
        let output = previous.output.get(index()?).ok_or_else(bad_request)?;
        Answer::PrevOutput(TxAckPrevOutput {
          tx: TxAckPrevOutputWrapper {
            output: PrevOutput {
              amount: output.value.to_sat(),
              script_pubkey: output.script_pubkey.to_bytes(),
            },
          },
        })
      }
      (RequestType::Input, None) => Answer::Input(TxAckInput {
        tx: TxAckInputWrapper {
          input: self.inputs.get(index()?).ok_or_else(bad_request)?.clone(),
        },
      }),
      (RequestType::Output, None) => Answer::Output(TxAckOutput {
        tx: TxAckOutputWrapper {
          output: self.outputs.get(index()?).ok_or_else(bad_request)?.clone(),
        },
      }),
      // Metadata of the transaction itself, extra data, replacement transactions and payment
      // requests are not part of a vault spend.
      _ => return Err(bad_request()),
    })
  }
}

/// The signatures that the device has sent so far, one for each input.
pub(crate) struct Signatures {
  slots: Vec<Option<RawSignature>>,
}

impl Signatures {
  pub(crate) fn new(inputs: usize) -> Self {
    Signatures {
      slots: vec![None; inputs],
    }
  }

  /// Takes the signature that a request carries, if it carries one.
  pub(crate) fn take(&mut self, request: &TxRequest) -> Result<(), Error> {
    let Some(serialized) = &request.serialized else {
      return Ok(());
    };
    if serialized.signature_index.is_none() && serialized.signature.is_none() {
      return Ok(());
    }
    let (Some(index), Some(der)) = (serialized.signature_index, &serialized.signature) else {
      return Err(bad_signature());
    };
    let slot = usize::try_from(index)
      .ok()
      .and_then(|index| self.slots.get_mut(index))
      .ok_or_else(bad_signature)?;
    if slot.is_some() {
      return Err(bad_signature());
    }
    *slot = Some(RawSignature::from_der(der).map_err(|_| bad_signature())?);
    Ok(())
  }

  /// True when every input has a signature.
  pub(crate) fn complete(&self) -> bool {
    self.slots.iter().all(Option::is_some)
  }

  /// The PSBT with the signatures added, each under the device's key for its input.
  pub(crate) fn apply(&self, psbt: &Psbt, keys: &[secp256k1::PublicKey]) -> Psbt {
    let mut signed = psbt.clone();
    for ((input, key), slot) in signed.inputs.iter_mut().zip(keys).zip(&self.slots) {
      if let Some(signature) = slot {
        input.partial_sigs.insert(
          PublicKey::new(*key),
          ecdsa::Signature {
            signature: *signature,
            sighash_type: EcdsaSighashType::All,
          },
        );
      }
    }
    signed
  }
}

fn bad_signature() -> Error {
  Error::new(
    ErrorKind::InvalidSignature,
    "The Trezor Safe 7 sent a signature that SVRA cannot use. Do not use the result. Contact Swan support.",
  )
}

impl<X: Transport> Device<'_, X> {
  /// Runs the signing conversation on `session` and returns the PSBT with the device's
  /// signatures.
  pub(crate) fn sign(&mut self, session: u8, psbt: &Psbt, plan: &Plan) -> Result<Psbt, Error> {
    let mut signatures = Signatures::new(plan.inputs.len());
    let announce = Some(Progress::Sign);
    let mut request: TxRequest = self.call(session, &plan.sign_tx, QUICK, Step::Sign, announce)?;
    for _ in 0..plan.round_limit {
      signatures.take(&request)?;
      request = match plan.answer(&request)? {
        Answer::Finished => {
          if !signatures.complete() {
            return Err(Error::new(
              ErrorKind::InvalidSignature,
              "The Trezor Safe 7 finished without a signature for every input. Do not use the result. Contact Swan support.",
            ));
          }
          return Ok(signatures.apply(psbt, &plan.keys));
        }
        Answer::Input(ack) => self.call(session, &ack, QUICK, Step::Sign, announce)?,
        Answer::Output(ack) => self.call(session, &ack, QUICK, Step::Sign, announce)?,
        Answer::PrevMeta(ack) => self.call(session, &ack, QUICK, Step::Sign, announce)?,
        Answer::PrevInput(ack) => self.call(session, &ack, QUICK, Step::Sign, announce)?,
        Answer::PrevOutput(ack) => self.call(session, &ack, QUICK, Step::Sign, announce)?,
      };
    }
    Err(Error::new(
      ErrorKind::Communication,
      "The Trezor Safe 7 asked for more data than a transaction of this size needs. Nothing was signed. Unplug the Trezor Safe 7, plug it in again, and try again.",
    ))
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::keys::DEVICE_NAME;
  use crate::proto::{TxRequestDetailsType, TxRequestSerializedType};
  use crate::test_support::{sign_with, simulator_xprv, Vault};
  use bdk_wallet::KeychainKind;
  use bitcoin::hashes::Hash;
  use bitcoin::ScriptBuf;
  use svra_vault::{parse_vault, precheck};

  struct Fixture {
    vault: Vault,
    psbt: Psbt,
    view: svra_vault::Vault,
    keys: Vec<secp256k1::PublicKey>,
  }

  fn view_of(vault: &Vault) -> svra_vault::Vault {
    parse_vault(
      DEVICE_NAME,
      &vault.receive_descriptor,
      Some(&vault.change_descriptor),
    )
    .expect("the descriptors parse")
    .for_device(vault.device_fingerprint)
    .expect("the device has a key")
  }

  fn fixture_with(make: impl FnOnce(&mut Vault) -> Psbt) -> Fixture {
    let mut vault = Vault::new(&simulator_xprv(), Network::Testnet);
    let psbt = make(&mut vault);
    let view = view_of(&vault);
    let keys = precheck(&psbt, vault.device_fingerprint, &view).expect("the pre-check passes");
    Fixture {
      vault,
      psbt,
      view,
      keys,
    }
  }

  fn sweep() -> Fixture {
    fixture_with(|vault| vault.sweep_psbt())
  }

  fn plan_of(fixture: &Fixture) -> Result<Plan, Error> {
    prepare(
      &fixture.psbt,
      &fixture.view,
      &fixture.keys,
      Network::Testnet,
      "Testnet",
    )
  }

  fn plan(fixture: &Fixture) -> Plan {
    plan_of(fixture).expect("the plan is built")
  }

  fn request(kind: RequestType, index: Option<u32>, hash: Option<Vec<u8>>) -> TxRequest {
    TxRequest {
      request_type: Some(kind as i32),
      details: Some(TxRequestDetailsType {
        request_index: index,
        tx_hash: hash,
      }),
      serialized: None,
    }
  }

  fn prev_hash_of(fixture: &Fixture, input: usize) -> Vec<u8> {
    let source = fixture.psbt.inputs[input]
      .non_witness_utxo
      .as_ref()
      .expect("a previous transaction");
    // The hex that block explorers show, as bytes.
    let text = source.compute_txid().to_string();
    (0..64)
      .step_by(2)
      .map(|i| u8::from_str_radix(&text[i..i + 2], 16).expect("hex"))
      .collect()
  }

  #[test]
  fn the_sign_request_carries_the_counts_the_version_and_the_lock_time() {
    let fixture = sweep();
    let plan = plan(&fixture);
    let tx = &fixture.psbt.unsigned_tx;
    assert_eq!(plan.sign_tx.inputs_count, 3);
    assert_eq!(plan.sign_tx.outputs_count, 1);
    assert_eq!(plan.sign_tx.coin_name.as_deref(), Some("Testnet"));
    assert_eq!(plan.sign_tx.version, Some(tx.version.0 as u32));
    assert_eq!(
      plan.sign_tx.lock_time,
      Some(tx.lock_time.to_consensus_u32())
    );
    // The app wants signatures and checks the transaction itself.
    assert_eq!(plan.sign_tx.serialize, Some(false));
  }

  #[test]
  fn an_input_carries_the_three_keys_in_the_order_of_the_descriptor() {
    let fixture = sweep();
    let plan = plan(&fixture);
    for (index, input) in plan.inputs.iter().enumerate() {
      let multisig = input.multisig.as_ref().expect("a multisig input");
      assert_eq!(multisig.m, 2);
      assert_eq!(
        multisig.pubkeys_order,
        Some(MultisigPubkeysOrder::Preserved as i32)
      );
      assert_eq!(multisig.nodes.len(), 3);
      for (position, node) in multisig.nodes.iter().enumerate() {
        let key = &fixture.view.keys[position].xpub;
        assert_eq!(node.depth, u32::from(key.depth));
        assert_eq!(node.child_num, u32::from(key.child_number));
        assert_eq!(node.chain_code, key.chain_code.to_bytes().to_vec());
        assert_eq!(node.public_key, key.public_key.serialize().to_vec());
      }
      // The keys are not in BIP-67 order. A device that sorted them would sign another script.
      let keys: Vec<&Vec<u8>> = multisig.nodes.iter().map(|node| &node.public_key).collect();
      assert_eq!(multisig.address_n.len(), 2);
      let path = &input.address_n;
      assert_eq!(path.len(), 6);
      assert_eq!(
        &path[..4],
        &path_numbers(&fixture.view.our_account_path)[..]
      );
      assert_eq!(&path[4..], &multisig.address_n[..]);
      assert_eq!(
        input.script_type,
        Some(InputScriptType::SpendWitness as i32)
      );
      assert_eq!(multisig.signatures, vec![Vec::<u8>::new(); 3]);
      assert_eq!(input.prev_hash, prev_hash_of(&fixture, index));
      assert_eq!(keys.len(), 3);
    }
  }

  #[test]
  fn the_cloud_key_is_a_node_at_depth_zero() {
    let fixture = sweep();
    let plan = plan(&fixture);
    let cloud = fixture
      .vault
      .order
      .iter()
      .position(|slot| *slot == 2)
      .expect("the cloud key is in the descriptor");
    let node = &plan.inputs[0].multisig.as_ref().expect("multisig").nodes[cloud];
    assert_eq!(node.depth, 0);
    assert_eq!(node.fingerprint, 0);
    assert_eq!(node.child_num, 0);
    assert_eq!(node.chain_code.len(), 32);
    assert_eq!(node.public_key.len(), 33);
  }

  #[test]
  fn the_amount_and_the_outpoint_come_from_the_previous_transaction() {
    let fixture = sweep();
    let plan = plan(&fixture);
    for (index, input) in plan.inputs.iter().enumerate() {
      let tx_in = &fixture.psbt.unsigned_tx.input[index];
      let source = fixture.psbt.inputs[index]
        .non_witness_utxo
        .as_ref()
        .expect("a source");
      assert_eq!(input.prev_index, tx_in.previous_output.vout);
      assert_eq!(
        input.amount,
        source.output[tx_in.previous_output.vout as usize]
          .value
          .to_sat()
      );
      assert_eq!(input.sequence, Some(tx_in.sequence.0));
    }
  }

  #[test]
  fn a_payment_goes_to_its_address() {
    let fixture = sweep();
    let plan = plan(&fixture);
    let output = &plan.outputs[0];
    let tx_out = &fixture.psbt.unsigned_tx.output[0];
    assert_eq!(
      output.script_type,
      Some(OutputScriptType::PayToAddress as i32)
    );
    assert_eq!(output.amount, tx_out.value.to_sat());
    assert_eq!(
      output.address.as_deref(),
      Some(
        Address::from_script(&tx_out.script_pubkey, Network::Testnet)
          .expect("an address")
          .to_string()
          .as_str()
      )
    );
  }

  /// Asserts that every output of the plan is a payment to the address of the matching output of
  /// the transaction, and that nothing marks it as change.
  fn assert_all_outputs_are_payments(fixture: &Fixture, plan: &Plan) {
    let transaction = &fixture.psbt.unsigned_tx;
    assert_eq!(plan.outputs.len(), transaction.output.len());
    assert_eq!(
      plan.sign_tx.outputs_count as usize,
      transaction.output.len()
    );
    for (output, tx_out) in plan.outputs.iter().zip(&transaction.output) {
      assert_eq!(
        output.script_type,
        Some(OutputScriptType::PayToAddress as i32)
      );
      assert_eq!(output.amount, tx_out.value.to_sat());
      assert_eq!(
        output.address.as_deref(),
        Some(
          Address::from_script(&tx_out.script_pubkey, Network::Testnet)
            .expect("an address")
            .to_string()
            .as_str()
        )
      );
    }
  }

  #[test]
  fn the_change_of_the_vault_goes_to_the_device_as_a_payment() {
    let fixture = fixture_with(|vault| vault.spend_with_change_psbt(120_000));
    assert!(
      fixture
        .psbt
        .outputs
        .iter()
        .any(|output| !output.bip32_derivation.is_empty()),
      "the change output lists the key of the device"
    );
    let plan = plan(&fixture);
    assert_eq!(plan.outputs.len(), 2);
    assert_all_outputs_are_payments(&fixture, &plan);
  }

  #[test]
  fn an_output_to_a_receive_address_of_the_vault_goes_to_the_device_as_a_payment() {
    let fixture = fixture_with(|vault| {
      let own = vault
        .wallet
        .peek_address(KeychainKind::External, 7)
        .script_pubkey();
      let mut builder = vault.wallet.build_tx();
      builder.add_recipient(own, bitcoin::Amount::from_sat(30_000));
      builder.finish().expect("the spend is built")
    });
    let plan = plan(&fixture);
    assert_all_outputs_are_payments(&fixture, &plan);
  }

  #[test]
  fn a_sweep_to_a_change_address_of_the_vault_goes_to_the_device_as_a_payment() {
    let fixture = fixture_with(|vault| {
      let mut psbt = vault.sweep_psbt();
      vault.pay_to_own_address(&mut psbt, 0, KeychainKind::Internal, 9_999);
      psbt
    });
    let plan = plan(&fixture);
    assert_eq!(plan.outputs.len(), 1);
    assert_all_outputs_are_payments(&fixture, &plan);
  }

  #[test]
  fn signatures_of_other_keys_go_to_their_slots() {
    let fixture = fixture_with(|vault| {
      let mut psbt = vault.sweep_psbt();
      sign_with(&vault.keys.software_xprv, &mut psbt);
      psbt
    });
    let plan = plan(&fixture);
    let software = fixture
      .vault
      .order
      .iter()
      .position(|slot| *slot == 1)
      .expect("the software key is in the descriptor");
    for input in &plan.inputs {
      let slots = &input.multisig.as_ref().expect("multisig").signatures;
      for (position, slot) in slots.iter().enumerate() {
        if position == software {
          // DER, without the sighash byte.
          assert!((68..=72).contains(&slot.len()), "{}", slot.len());
          assert_eq!(slot[0], 0x30);
        } else {
          assert!(slot.is_empty(), "slot {position}");
        }
      }
    }
  }

  fn error_of(result: Result<Plan, Error>) -> Error {
    match result {
      Ok(_) => panic!("the plan was built"),
      Err(error) => error,
    }
  }

  #[test]
  fn a_signature_of_the_device_on_some_inputs_only_is_refused() {
    let mut fixture = sweep();
    sign_with(&fixture.vault.keys.device_xprv, &mut fixture.psbt);
    fixture.psbt.inputs[1].partial_sigs.clear();
    let error = error_of(plan_of(&fixture));
    assert_eq!(error.kind, ErrorKind::InvalidPsbt);
    assert!(
      error.message.contains("holds a signature of this"),
      "{}",
      error.message
    );
  }

  #[test]
  fn a_device_signature_that_does_not_verify_is_not_called_a_signature_on_one_input_only() {
    let mut fixture = sweep();
    sign_with(&fixture.vault.keys.device_xprv, &mut fixture.psbt);
    // Every input holds a signature of the device, and none of them is valid for this lock time.
    fixture.psbt.unsigned_tx.lock_time = bitcoin::absolute::LockTime::from_height(700_000).unwrap();
    let error = error_of(plan_of(&fixture));
    assert_eq!(error.kind, ErrorKind::InvalidPsbt);
    assert!(
      error.message.contains("SVRA cannot use"),
      "{}",
      error.message
    );
    assert!(
      !error.message.contains("some other input does not"),
      "{}",
      error.message
    );
  }

  #[test]
  fn a_signature_of_a_key_that_is_not_in_the_vault_is_refused() {
    let mut fixture = sweep();
    sign_with(&fixture.vault.keys.software_xprv, &mut fixture.psbt);
    let stranger = secp256k1::SecretKey::from_slice(&[0x66; 32]).expect("a key");
    let secp = secp256k1::Secp256k1::new();
    let existing = *fixture.psbt.inputs[0]
      .partial_sigs
      .values()
      .next()
      .expect("a signature");
    fixture.psbt.inputs[0]
      .partial_sigs
      .insert(PublicKey::new(stranger.public_key(&secp)), existing);
    let error = error_of(plan_of(&fixture));
    assert_eq!(error.kind, ErrorKind::InvalidPsbt);
    assert!(
      error.message.contains("not in this vault"),
      "{}",
      error.message
    );
  }

  #[test]
  fn a_signature_that_does_not_cover_the_whole_transaction_is_refused() {
    let mut fixture = sweep();
    sign_with(&fixture.vault.keys.software_xprv, &mut fixture.psbt);
    for signature in fixture.psbt.inputs[2].partial_sigs.values_mut() {
      signature.sighash_type = EcdsaSighashType::None;
    }
    let error = error_of(plan_of(&fixture));
    assert_eq!(error.kind, ErrorKind::InvalidPsbt);
    assert!(
      error.message.contains("whole transaction"),
      "{}",
      error.message
    );
  }

  #[test]
  fn an_output_script_that_has_no_address_is_refused() {
    let mut fixture = sweep();
    fixture.psbt.unsigned_tx.output[0].script_pubkey = ScriptBuf::new_op_return([1_u8, 2, 3]);
    fixture.keys = precheck(
      &fixture.psbt,
      fixture.vault.device_fingerprint,
      &fixture.view,
    )
    .expect("the pre-check passes");
    let error = error_of(plan_of(&fixture));
    assert_eq!(error.kind, ErrorKind::InvalidPsbt);
    assert!(error.message.contains("Output 0"), "{}", error.message);
  }

  #[test]
  fn the_round_limit_grows_with_the_data_that_the_device_may_ask_for() {
    let fixture = sweep();
    let plan = plan(&fixture);
    let previous: usize = fixture
      .psbt
      .inputs
      .iter()
      .map(|input| {
        let tx = input.non_witness_utxo.as_ref().expect("a source");
        1 + tx.input.len() + tx.output.len()
      })
      .sum();
    assert!(plan.round_limit >= 8 * (3 + 1 + previous));
    assert!(plan.round_limit < 10_000);
  }

  #[test]
  fn the_device_gets_the_inputs_the_outputs_and_the_previous_transactions_it_asks_for() {
    let fixture = sweep();
    let plan = plan(&fixture);
    let hash = prev_hash_of(&fixture, 0);
    let source = fixture.psbt.inputs[0]
      .non_witness_utxo
      .clone()
      .expect("a source");

    match plan
      .answer(&request(RequestType::Input, Some(2), None))
      .expect("an answer")
    {
      Answer::Input(ack) => assert_eq!(ack.tx.input, plan.inputs[2]),
      _ => panic!("an input"),
    }
    match plan
      .answer(&request(RequestType::Output, Some(0), None))
      .expect("an answer")
    {
      Answer::Output(ack) => assert_eq!(ack.tx.output, plan.outputs[0]),
      _ => panic!("an output"),
    }
    match plan
      .answer(&request(RequestType::Meta, None, Some(hash.clone())))
      .expect("an answer")
    {
      Answer::PrevMeta(ack) => {
        assert_eq!(ack.tx.inputs_count as usize, source.input.len());
        assert_eq!(ack.tx.outputs_count as usize, source.output.len());
        assert_eq!(ack.tx.version, source.version.0 as u32);
        assert_eq!(ack.tx.lock_time, source.lock_time.to_consensus_u32());
      }
      _ => panic!("a meta"),
    }
    match plan
      .answer(&request(RequestType::Input, Some(0), Some(hash.clone())))
      .expect("an answer")
    {
      Answer::PrevInput(ack) => {
        let input = &source.input[0];
        let mut spent = input.previous_output.txid.to_byte_array().to_vec();
        spent.reverse();
        assert_eq!(ack.tx.input.prev_hash, spent);
        assert_eq!(ack.tx.input.prev_index, input.previous_output.vout);
        assert_eq!(ack.tx.input.script_sig, input.script_sig.to_bytes());
        assert_eq!(ack.tx.input.sequence, input.sequence.0);
      }
      _ => panic!("a previous input"),
    }
    match plan
      .answer(&request(RequestType::Output, Some(0), Some(hash)))
      .expect("an answer")
    {
      Answer::PrevOutput(ack) => {
        assert_eq!(ack.tx.output.amount, source.output[0].value.to_sat());
        assert_eq!(
          ack.tx.output.script_pubkey,
          source.output[0].script_pubkey.to_bytes()
        );
      }
      _ => panic!("a previous output"),
    }
    assert!(matches!(
      plan.answer(&request(RequestType::Finished, None, None)),
      Ok(Answer::Finished)
    ));
  }

  #[test]
  fn a_request_with_an_index_or_a_hash_that_does_not_exist_is_refused() {
    let fixture = sweep();
    let plan = plan(&fixture);
    let hash = prev_hash_of(&fixture, 0);
    let source_inputs = fixture.psbt.inputs[0]
      .non_witness_utxo
      .as_ref()
      .expect("a source")
      .input
      .len() as u32;
    let refused = |request: TxRequest| plan.answer(&request).is_err();
    // Indexes out of range, including one that does not fit in an `usize` on a small machine.
    assert!(refused(request(RequestType::Input, Some(3), None)));
    assert!(refused(request(RequestType::Input, Some(u32::MAX), None)));
    assert!(refused(request(RequestType::Output, Some(1), None)));
    assert!(refused(request(
      RequestType::Input,
      Some(source_inputs),
      Some(hash.clone())
    )));
    assert!(refused(request(
      RequestType::Output,
      Some(99),
      Some(hash.clone())
    )));
    // A hash that is unknown or has the wrong length.
    assert!(refused(request(RequestType::Meta, None, Some(vec![7; 32]))));
    assert!(refused(request(
      RequestType::Meta,
      None,
      Some(hash[..31].to_vec())
    )));
    // A missing index, a missing detail, a missing type.
    assert!(refused(request(RequestType::Input, None, None)));
    assert!(refused(TxRequest {
      request_type: Some(RequestType::Input as i32),
      details: None,
      serialized: None,
    }));
    assert!(refused(TxRequest {
      request_type: None,
      details: None,
      serialized: None,
    }));
    assert!(refused(TxRequest {
      request_type: Some(99),
      details: None,
      serialized: None,
    }));
    // Requests that a vault spend never needs.
    assert!(refused(request(RequestType::Meta, None, None)));
    assert!(refused(request(
      RequestType::ExtraData,
      Some(0),
      Some(hash.clone())
    )));
    assert!(refused(request(RequestType::OrigInput, Some(0), None)));
    assert!(refused(request(RequestType::PaymentReq, Some(0), None)));
  }

  fn signature_request(index: Option<u32>, der: Option<Vec<u8>>) -> TxRequest {
    TxRequest {
      request_type: Some(RequestType::Input as i32),
      details: None,
      serialized: Some(TxRequestSerializedType {
        signature_index: index,
        signature: der,
      }),
    }
  }

  fn some_der() -> Vec<u8> {
    let secp = secp256k1::Secp256k1::new();
    let key = secp256k1::SecretKey::from_slice(&[3; 32]).expect("a key");
    secp
      .sign_ecdsa(&secp256k1::Message::from_digest([9; 32]), &key)
      .serialize_der()
      .to_vec()
  }

  #[test]
  fn signatures_are_collected_once_for_each_input() {
    let mut signatures = Signatures::new(2);
    signatures
      .take(&request(RequestType::Input, Some(0), None))
      .expect("no signature is fine");
    assert!(!signatures.complete());
    signatures
      .take(&signature_request(Some(1), Some(some_der())))
      .expect("a signature");
    assert!(!signatures.complete());
    signatures
      .take(&signature_request(Some(0), Some(some_der())))
      .expect("a signature");
    assert!(signatures.complete());
  }

  #[test]
  fn a_signature_for_an_index_that_does_not_exist_or_twice_is_refused() {
    let mut signatures = Signatures::new(2);
    for index in [2, u32::MAX] {
      let error = signatures
        .take(&signature_request(Some(index), Some(some_der())))
        .expect_err("out of range");
      assert_eq!(error.kind, ErrorKind::InvalidSignature);
    }
    signatures
      .take(&signature_request(Some(0), Some(some_der())))
      .expect("a signature");
    assert!(signatures
      .take(&signature_request(Some(0), Some(some_der())))
      .is_err());
  }

  #[test]
  fn half_a_signature_or_one_that_is_not_der_is_refused() {
    let mut signatures = Signatures::new(2);
    assert!(signatures.take(&signature_request(Some(0), None)).is_err());
    assert!(signatures
      .take(&signature_request(None, Some(some_der())))
      .is_err());
    assert!(signatures
      .take(&signature_request(Some(0), Some(vec![1, 2, 3])))
      .is_err());
    assert!(signatures
      .take(&signature_request(Some(0), Some(Vec::new())))
      .is_err());
  }

  #[test]
  fn the_signatures_are_added_under_the_key_of_each_input() {
    let fixture = sweep();
    let mut signatures = Signatures::new(3);
    for index in 0..3 {
      signatures
        .take(&signature_request(Some(index), Some(some_der())))
        .expect("a signature");
    }
    let signed = signatures.apply(&fixture.psbt, &fixture.keys);
    for (input, key) in signed.inputs.iter().zip(&fixture.keys) {
      assert_eq!(input.partial_sigs.len(), 1);
      let signature = input
        .partial_sigs
        .get(&PublicKey::new(*key))
        .expect("the device's signature");
      assert_eq!(signature.sighash_type, EcdsaSighashType::All);
    }
    // The original is untouched.
    assert!(fixture
      .psbt
      .inputs
      .iter()
      .all(|input| input.partial_sigs.is_empty()));
  }
}
