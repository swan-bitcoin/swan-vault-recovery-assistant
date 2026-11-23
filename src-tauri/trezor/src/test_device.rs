//! A Trezor Safe 7 in software, for the tests. It runs the device side of THP from `trezor-thp`
//! and a scripted application: pairing with a code, wallet sessions, `GetFeatures`,
//! `GetPublicKey` and `SignTx` with a software key. It is also a [`Transport`]: a host packet
//! goes in, and the packets that the device sends back wait in a queue until the host reads
//! them. No thread, no clock and no socket are involved, so a run is the same every time.
//!
//! The device checks what a real one checks and the tests care about: the pairing tag, that the
//! previous transactions hash to what the inputs say, the amounts, and the multisig structure.
//! It signs with the same BIP-143 hash that the vault uses.

use crate::cpace;
use crate::link::Crypto;
use crate::proto::*;
use crate::transport::{Transport, TransportError};
use bitcoin::bip32::{ChildNumber, DerivationPath, Xpriv, Xpub};
use bitcoin::hashes::{sha256, Hash};
use bitcoin::secp256k1::{Message as SecpMessage, Secp256k1};
use bitcoin::sighash::{EcdsaSighashType, SighashCache};
use bitcoin::{
  absolute, transaction, Address, Amount, NetworkKind, OutPoint, ScriptBuf, Sequence, Transaction,
  TxIn, TxOut, Txid, Witness,
};
use prost::Message;
use std::cell::RefCell;
use std::collections::{HashMap, VecDeque};
use std::rc::Rc;
use std::str::FromStr;
use std::time::Duration;
use trezor_thp::channel::buffered::Buffered;
use trezor_thp::channel::device::{Channel, ChannelIdAllocator, ChannelOpen, Mux};
use trezor_thp::channel::{PacketInResult, PairingState};
use trezor_thp::credential::CredentialVerifier;
use trezor_thp::ChannelIO;

/// How the signing of the software device goes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum SignMode {
  /// A signature of the device's key for every input.
  Honest,
  /// The signatures are valid, but they are of another key.
  WrongKey,
  /// The device finishes and sends no signature at all.
  NoSignatures,
  /// The user cancels on the device after the transaction was shown.
  Cancel,
  /// The device asks for the first input again and again.
  Endless,
}

/// What the software device does. The default is a Safe 7 with a wallet, no PIN, no
/// passphrase, firmware 2.13.1 and an honest signer.
#[derive(Clone)]
pub(crate) struct Behavior {
  /// The device answers no packet.
  pub silent: bool,
  /// The device sends a packet of another channel whenever the host reads, and nothing else.
  pub babble: bool,
  /// The device is locked at the handshake. With `unlock_fails` the user does not unlock it.
  pub locked: bool,
  pub unlock_fails: bool,
  /// The device reports itself as locked in `Features`, and asks for the PIN at the next session.
  pub features_locked: bool,
  /// Packets from the host (counted from 0) that never arrive.
  pub drop_host_packets: Vec<usize>,
  /// The host's write fails with a disconnect after this many packets.
  pub disconnect_after: Option<usize>,
  /// The user refuses the connection on the device.
  pub refuse_pairing: bool,
  /// The user presses the button of the code screen, which cancels the pairing. The device sends
  /// its failure at once, as the firmware does, and drops any host message after it.
  pub cancel_at_code: bool,
  /// The device is unplugged right after it sent its answer to the pairing challenge.
  pub unplug_at_code: bool,
  /// The device says that it is already paired.
  pub claim_paired: bool,
  pub model: String,
  pub major_version: u32,
  pub minor_version: u32,
  pub patch_version: u32,
  pub bootloader_mode: bool,
  pub initialized: bool,
  pub passphrase_protection: bool,
  pub passphrase_always_on_device: bool,
  /// The wallet of the standard session.
  pub standard_wallet: Xpriv,
  /// The wallet that the user opens by typing a passphrase on the device.
  pub passphrase_wallet: Xpriv,
  pub sign_mode: SignMode,
  /// The user cancels the passphrase entry.
  pub cancel_passphrase: bool,
}

impl Default for Behavior {
  fn default() -> Self {
    Behavior {
      silent: false,
      babble: false,
      locked: false,
      unlock_fails: false,
      features_locked: false,
      drop_host_packets: Vec::new(),
      disconnect_after: None,
      refuse_pairing: false,
      cancel_at_code: false,
      unplug_at_code: false,
      claim_paired: false,
      model: "T3W1".to_string(),
      major_version: 2,
      minor_version: 13,
      patch_version: 1,
      bootloader_mode: false,
      initialized: true,
      passphrase_protection: false,
      passphrase_always_on_device: false,
      standard_wallet: Xpriv::new_master(NetworkKind::Test, &[0x31; 32]).expect("a master key"),
      passphrase_wallet: Xpriv::new_master(NetworkKind::Test, &[0x32; 32]).expect("a master key"),
      sign_mode: SignMode::Honest,
      cancel_passphrase: false,
    }
  }
}

struct Verifier {
  claim_paired: bool,
}

impl CredentialVerifier for Verifier {
  fn verify(&self, _remote_static_pubkey: &[u8], _credential: &[u8]) -> PairingState {
    if self.claim_paired {
      PairingState::Paired
    } else {
      PairingState::Unpaired
    }
  }
}

enum Chan {
  Handshake(Box<Buffered<ChannelOpen<Verifier, Crypto>>>),
  Ready(Box<Buffered<Channel<Crypto>>>),
  /// Between `Handshake` and `Ready`.
  Moving,
}

/// What the device waits for after it sent a button request.
enum AfterButton {
  PairingApproved,
  Transaction,
}

enum Want {
  Input(usize),
  PrevMeta(Vec<u8>),
  PrevInput(Vec<u8>, usize),
  PrevOutput(Vec<u8>, usize),
  Output(usize),
}

#[derive(Default)]
struct PrevBuild {
  version: u32,
  lock_time: u32,
  inputs: Vec<TxIn>,
  outputs: Vec<TxOut>,
}

struct SignState {
  tx: SignTx,
  inputs: Vec<TxInput>,
  outputs: Vec<TxOutput>,
  prev: HashMap<Vec<u8>, PrevBuild>,
  todo: VecDeque<Want>,
  asked: Option<Want>,
  /// The signatures still to send, after the user confirmed.
  signatures: Option<VecDeque<(u32, Vec<u8>)>>,
}

struct Inner {
  behavior: Behavior,
  mux: Buffered<Mux<Crypto>>,
  ids: ChannelIdAllocator,
  channel: Option<(u16, Chan)>,
  outbox: VecDeque<Vec<u8>>,
  sent: Vec<Vec<u8>>,
  host_packets: usize,
  pending: VecDeque<(u8, u16, Vec<u8>)>,
  /// The code on the device's screen, once it shows one.
  code: Option<String>,
  secret: [u8; 16],
  cpace_private: [u8; 32],
  wallets: HashMap<u8, Xpriv>,
  after_button: Option<AfterButton>,
  signing: Option<SignState>,
  /// Every application message that the host sent, in order: session and type.
  received: Vec<(u8, u16)>,
  /// The user cancelled on the code screen. The pairing is over, and the device answers nothing.
  cancelled: bool,
}

#[derive(Clone)]
pub(crate) struct SoftDevice(Rc<RefCell<Inner>>);

fn properties(behavior: &Behavior) -> Vec<u8> {
  ThpDeviceProperties {
    internal_model: behavior.model.clone(),
    model_variant: None,
    protocol_version_major: 2,
    protocol_version_minor: 0,
    pairing_methods: vec![ThpPairingMethod::CodeEntry as i32],
  }
  .encode_to_vec()
}

impl SoftDevice {
  pub(crate) fn new(behavior: Behavior) -> Self {
    Self::with_first_channel(behavior, 0x0100)
  }

  /// A device that hands out channel numbers from `first`.
  pub(crate) fn with_first_channel(behavior: Behavior, first: u16) -> Self {
    let mux = Mux::<Crypto>::new(&properties(&behavior)).expect("device properties fit");
    SoftDevice(Rc::new(RefCell::new(Inner {
      behavior,
      mux: Buffered::new(mux),
      ids: ChannelIdAllocator::new_from(first),
      channel: None,
      outbox: VecDeque::new(),
      sent: Vec::new(),
      host_packets: 0,
      pending: VecDeque::new(),
      code: None,
      secret: [0; 16],
      cpace_private: [0; 32],
      wallets: HashMap::new(),
      after_button: None,
      signing: None,
      received: Vec::new(),
      cancelled: false,
    })))
  }

  /// The code on the device's screen. `None` before the device shows one.
  pub(crate) fn code(&self) -> Option<String> {
    self.0.borrow().code.clone()
  }

  /// The number of packets that the host wrote so far, the ones that never arrived included.
  pub(crate) fn host_packet_count(&self) -> usize {
    self.0.borrow().host_packets
  }

  /// Every packet that the device sent so far.
  pub(crate) fn sent_packets(&self) -> Vec<Vec<u8>> {
    self.0.borrow().sent.clone()
  }

  /// Puts packets of an earlier session in front of the device's answers.
  pub(crate) fn inject(&self, packets: Vec<Vec<u8>>) {
    let mut inner = self.0.borrow_mut();
    for packet in packets.into_iter().rev() {
      inner.outbox.push_front(packet);
    }
  }

  /// The types of the messages that the host sent, in order, with their session.
  pub(crate) fn received(&self) -> Vec<(u8, u16)> {
    self.0.borrow().received.clone()
  }

  /// Packets that an earlier run left in the device's queue: a full session of another channel,
  /// as the device sent it.
  pub(crate) fn queue_stale_packets(&mut self) {
    let mut old = SoftDevice::with_first_channel(Behavior::default(), 0x0555);
    let allocated = crate::link::Allocated::allocate(&mut old, false).expect("a channel");
    let (_link, _) = allocated
      .handshake(crate::link::QUICK)
      .expect("a handshake");
    // A broken-off answer: the first packet of a long message and nothing after it.
    let mut stale = old.sent_packets();
    let mut cut = vec![0x04_u8, 0x01, 0x00, 0x03, 0xe8];
    cut.resize(64, 0xab);
    stale.push(cut);
    self.inject(stale);
  }
}

impl Transport for SoftDevice {
  fn write_packet(&mut self, packet: &[u8]) -> Result<(), TransportError> {
    let mut inner = self.0.borrow_mut();
    let index = inner.host_packets;
    inner.host_packets += 1;
    if inner
      .behavior
      .disconnect_after
      .is_some_and(|after| index >= after)
    {
      return Err(TransportError::Disconnected);
    }
    if inner.behavior.silent || inner.behavior.drop_host_packets.contains(&index) {
      return Ok(());
    }
    inner.on_host_packet(packet);
    Ok(())
  }

  fn read_packet(&mut self, _timeout: Duration) -> Result<Option<Vec<u8>>, TransportError> {
    let mut inner = self.0.borrow_mut();
    if inner.behavior.silent {
      return Ok(None);
    }
    if inner.behavior.unplug_at_code && inner.code.is_some() && inner.outbox.is_empty() {
      return Err(TransportError::Disconnected);
    }
    if inner.behavior.babble {
      let mut packet = vec![0x04, 0x07, 0x07, 0x00, 0x10];
      packet.resize(64, 0);
      return Ok(Some(packet));
    }
    Ok(inner.outbox.pop_front())
  }
}

fn failure(code: FailureType, message: &str) -> Failure {
  Failure {
    code: Some(code as i32),
    message: Some(message.to_string()),
  }
}

impl Inner {
  fn queue<M: Wire>(&mut self, session: u8, message: &M) {
    self
      .pending
      .push_back((session, M::TYPE, message.encode_to_vec()));
  }

  fn on_host_packet(&mut self, packet: &[u8]) {
    if packet.len() < 3 {
      return;
    }
    let id = u16::from_be_bytes([packet[1], packet[2]]);
    if id == 0xffff {
      let result = self.mux.packet_in(packet);
      if result.got_channel() {
        let channel_id = self.ids.get();
        let open = self
          .mux
          .channel_alloc(
            channel_id,
            Verifier {
              claim_paired: self.behavior.claim_paired,
            },
          )
          .expect("a channel");
        self.channel = Some((channel_id, Chan::Handshake(Box::new(Buffered::new(open)))));
      }
    } else if self.channel.as_ref().is_some_and(|(own, _)| *own == id) {
      self.on_channel_packet(packet);
    } else {
      let _ = self.mux.send_unallocated_channel(id);
    }
    self.flush();
  }

  fn on_channel_packet(&mut self, packet: &[u8]) {
    let mut message = None;
    if let Some((_, chan)) = self.channel.as_mut() {
      match chan {
        Chan::Handshake(open) => {
          if let PacketInResult::HandshakeKeyRequired { try_to_unlock } = open.packet_in(packet) {
            let stays_locked =
              self.behavior.locked && (!try_to_unlock || self.behavior.unlock_fails);
            if stays_locked {
              open.send_device_locked().expect("the key is required");
            } else {
              open.set_static_key(&[7; 32]).expect("the key is required");
            }
          }
        }
        Chan::Ready(io) => {
          if io.packet_in(packet).got_message() {
            if let Ok((session, message_type, body)) = io.message_out() {
              message = Some((session, message_type, body, *io.handshake_hash()));
            }
          }
        }
        Chan::Moving => {}
      }
    }
    if let Some((session, message_type, body, hash)) = message {
      self.on_message(session, message_type, &body, hash);
    }
  }

  fn flush(&mut self) {
    loop {
      while self.mux.packet_out_ready() {
        let packet = self.mux.packet_out().expect("a packet");
        self.push_out(packet);
      }
      let mut progress = false;
      if let Some((_, chan)) = self.channel.as_mut() {
        match chan {
          Chan::Handshake(open) => {
            while open.packet_out_ready() {
              let packet = open.packet_out().expect("a packet");
              self.outbox.push_back(packet.clone());
              self.sent.push(packet);
            }
            if open.handshake_done() {
              let Chan::Handshake(open) = std::mem::replace(chan, Chan::Moving) else {
                unreachable!("the channel was in the handshake");
              };
              let ready = (*open)
                .map(|open| open.complete())
                .expect("the handshake is done");
              *chan = Chan::Ready(Box::new(ready));
              progress = true;
            }
          }
          Chan::Ready(io) => {
            if let Some((session, message_type, body)) = self.pending.front().cloned() {
              if io.message_in(session, message_type, &body).is_ok() {
                self.pending.pop_front();
                progress = true;
              }
            }
            while io.packet_out_ready() {
              let packet = io.packet_out().expect("a packet");
              self.outbox.push_back(packet.clone());
              self.sent.push(packet);
            }
          }
          Chan::Moving => {}
        }
      }
      if !progress {
        return;
      }
    }
  }

  fn push_out(&mut self, packet: Vec<u8>) {
    self.outbox.push_back(packet.clone());
    self.sent.push(packet);
  }

  fn on_message(&mut self, session: u8, message_type: u16, body: &[u8], hash: [u8; 32]) {
    self.received.push((session, message_type));
    if self.cancelled {
      return;
    }
    match message_type {
      ThpPairingRequest::TYPE => {
        if self.behavior.refuse_pairing {
          self.queue(
            session,
            &failure(FailureType::ActionCancelled, "Action cancelled"),
          );
        } else {
          self.after_button = Some(AfterButton::PairingApproved);
          self.queue(session, &ButtonRequest::default());
        }
      }
      ButtonAck::TYPE => match self.after_button.take() {
        Some(AfterButton::PairingApproved) => self.queue(session, &ThpPairingRequestApproved {}),
        Some(AfterButton::Transaction) => self.confirm_transaction(session),
        None => self.queue(
          session,
          &failure(FailureType::UnexpectedMessage, "No button"),
        ),
      },
      ThpSelectMethod::TYPE => {
        crate::link::random_bytes(&mut self.secret);
        let commitment = sha256::Hash::hash(&self.secret).to_byte_array().to_vec();
        self.queue(session, &ThpCodeEntryCommitment { commitment });
      }
      ThpCodeEntryChallenge::TYPE => {
        let Ok(challenge) = ThpCodeEntryChallenge::decode(body) else {
          return;
        };
        let code = cpace::code_from_secret(&hash, &self.secret, &challenge.challenge);
        let generator = cpace::generator(code.as_bytes(), &hash);
        crate::link::random_bytes(&mut self.cpace_private);
        let public = x25519_dalek::x25519(self.cpace_private, generator);
        self.code = Some(code);
        self.queue(
          session,
          &ThpCodeEntryCpaceTrezor {
            cpace_trezor_public_key: public.to_vec(),
          },
        );
        // The firmware cancels by itself when the user presses the button of the code screen. It
        // sends the failure at once and does not wait for the host.
        if self.behavior.cancel_at_code {
          self.cancelled = true;
          self.queue(
            session,
            &failure(FailureType::ActionCancelled, "Action cancelled"),
          );
        }
      }
      ThpCodeEntryCpaceHostTag::TYPE => {
        let Ok(tag) = ThpCodeEntryCpaceHostTag::decode(body) else {
          return;
        };
        let Ok(host_key) = <[u8; 32]>::try_from(tag.cpace_host_public_key.as_slice()) else {
          self.queue(session, &failure(FailureType::DataError, "Invalid key"));
          return;
        };
        let shared = x25519_dalek::x25519(self.cpace_private, host_key);
        let expected = sha256::Hash::hash(&shared).to_byte_array();
        if host_key == [0; 32] || shared == [0; 32] || expected.as_slice() != tag.tag.as_slice() {
          self.queue(
            session,
            &failure(FailureType::DataError, "Unexpected Code Entry Tag"),
          );
          return;
        }
        self.queue(
          session,
          &ThpCodeEntrySecret {
            secret: self.secret.to_vec(),
          },
        );
      }
      ThpEndRequest::TYPE => {
        if let Some((_, Chan::Ready(io))) = self.channel.as_mut() {
          io.end_pairing();
        }
        self.queue(session, &ThpEndResponse {});
      }
      GetFeatures::TYPE => {
        let b = &self.behavior;
        let features = Features {
          major_version: b.major_version,
          minor_version: b.minor_version,
          patch_version: b.patch_version,
          bootloader_mode: Some(b.bootloader_mode),
          passphrase_protection: Some(b.passphrase_protection),
          initialized: Some(b.initialized),
          unlocked: Some(!b.features_locked),
          firmware_present: Some(true),
          passphrase_always_on_device: Some(b.passphrase_always_on_device),
          internal_model: Some(b.model.clone()),
        };
        self.queue(session, &features);
      }
      ThpCreateNewSession::TYPE => {
        let Ok(request) = ThpCreateNewSession::decode(body) else {
          return;
        };
        let on_device =
          request.on_device == Some(true) || self.behavior.passphrase_always_on_device;
        if on_device && self.behavior.cancel_passphrase {
          self.queue(
            session,
            &failure(FailureType::ActionCancelled, "Action cancelled"),
          );
          return;
        }
        let wallet = if on_device {
          self.behavior.passphrase_wallet
        } else {
          self.behavior.standard_wallet
        };
        self.wallets.insert(session, wallet);
        self.queue(
          session,
          &Success {
            message: Some("New session created.".to_string()),
          },
        );
      }
      GetPublicKey::TYPE => self.get_public_key(session, body),
      SignTx::TYPE => self.start_signing(session, body),
      Cancel::TYPE => self.queue(session, &failure(FailureType::ActionCancelled, "Cancelled")),
      TxAckInput::TYPE => self.tx_ack(session, body),
      _ => self.queue(
        session,
        &failure(FailureType::UnexpectedMessage, "Unexpected"),
      ),
    }
  }

  fn get_public_key(&mut self, session: u8, body: &[u8]) {
    let Ok(request) = GetPublicKey::decode(body) else {
      return;
    };
    let Some(master) = self.wallets.get(&session).copied() else {
      self.queue(session, &failure(FailureType::InvalidSession, "No session"));
      return;
    };
    let secp = Secp256k1::new();
    let path: DerivationPath = request
      .address_n
      .iter()
      .map(|number| ChildNumber::from(*number))
      .collect::<Vec<_>>()
      .into();
    let derived = master.derive_priv(&secp, &path).expect("a path");
    let mut xpub = Xpub::from_priv(&secp, &derived);
    xpub.network = if request.coin_name.as_deref() == Some("Bitcoin") {
      NetworkKind::Main
    } else {
      NetworkKind::Test
    };
    let reply = PublicKey {
      node: HdNodeType {
        depth: u32::from(xpub.depth),
        fingerprint: u32::from_be_bytes(xpub.parent_fingerprint.to_bytes()),
        child_num: u32::from(xpub.child_number),
        chain_code: xpub.chain_code.to_bytes().to_vec(),
        public_key: xpub.public_key.serialize().to_vec(),
      },
      xpub: xpub.to_string(),
      root_fingerprint: Some(u32::from_be_bytes(master.fingerprint(&secp).to_bytes())),
    };
    self.queue(session, &reply);
  }

  fn start_signing(&mut self, session: u8, body: &[u8]) {
    let Ok(tx) = SignTx::decode(body) else {
      return;
    };
    if !self.wallets.contains_key(&session) || tx.inputs_count == 0 {
      self.queue(session, &failure(FailureType::InvalidSession, "No session"));
      return;
    }
    let todo = (0..tx.inputs_count as usize).map(Want::Input).collect();
    self.signing = Some(SignState {
      tx,
      inputs: Vec::new(),
      outputs: Vec::new(),
      prev: HashMap::new(),
      todo,
      asked: None,
      signatures: None,
    });
    self.ask_next(session);
  }

  fn ask_next(&mut self, session: u8) {
    let Some(state) = self.signing.as_mut() else {
      return;
    };
    let Some(want) = state.todo.pop_front() else {
      self.all_collected(session);
      return;
    };
    let request = match &want {
      Want::Input(i) => tx_request(RequestType::Input, *i, None),
      Want::Output(i) => tx_request(RequestType::Output, *i, None),
      Want::PrevMeta(hash) => tx_request(RequestType::Meta, 0, Some(hash.clone())),
      Want::PrevInput(hash, i) => tx_request(RequestType::Input, *i, Some(hash.clone())),
      Want::PrevOutput(hash, i) => tx_request(RequestType::Output, *i, Some(hash.clone())),
    };
    state.asked = Some(want);
    self.queue(session, &request);
  }

  fn tx_ack(&mut self, session: u8, body: &[u8]) {
    let Some(state) = self.signing.as_mut() else {
      self.queue(
        session,
        &failure(FailureType::UnexpectedMessage, "No transaction"),
      );
      return;
    };
    // The answer to the last request after the user confirmed: send the next signature.
    if state.signatures.is_some() {
      self.next_signature(session);
      return;
    }
    let Some(want) = state.asked.take() else {
      self.queue(
        session,
        &failure(FailureType::UnexpectedMessage, "Nothing asked"),
      );
      return;
    };
    let bad = |message: &str| failure(FailureType::DataError, message);
    let mut reply = None;
    match want {
      Want::Input(_) => match TxAckInput::decode(body) {
        Ok(ack) => {
          state.inputs.push(ack.tx.input);
          if state.inputs.len() == state.tx.inputs_count as usize {
            let mut hashes: Vec<Vec<u8>> = Vec::new();
            for input in &state.inputs {
              if !hashes.contains(&input.prev_hash) {
                hashes.push(input.prev_hash.clone());
              }
            }
            state.todo.extend(hashes.into_iter().map(Want::PrevMeta));
            state
              .todo
              .extend((0..state.tx.outputs_count as usize).map(Want::Output));
          }
        }
        Err(_) => reply = Some(bad("Invalid input")),
      },
      Want::Output(_) => match TxAckOutput::decode(body) {
        Ok(ack) => state.outputs.push(ack.tx.output),
        Err(_) => reply = Some(bad("Invalid output")),
      },
      Want::PrevMeta(hash) => match TxAckPrevMeta::decode(body) {
        Ok(ack) => {
          let meta = ack.tx;
          state.prev.insert(
            hash.clone(),
            PrevBuild {
              version: meta.version,
              lock_time: meta.lock_time,
              ..PrevBuild::default()
            },
          );
          for i in (0..meta.outputs_count as usize).rev() {
            state.todo.push_front(Want::PrevOutput(hash.clone(), i));
          }
          for i in (0..meta.inputs_count as usize).rev() {
            state.todo.push_front(Want::PrevInput(hash.clone(), i));
          }
        }
        Err(_) => reply = Some(bad("Invalid meta")),
      },
      Want::PrevInput(hash, _) => match TxAckPrevInput::decode(body) {
        Ok(ack) => {
          let input = ack.tx.input;
          let mut txid = input.prev_hash.clone();
          txid.reverse();
          let build = state.prev.get_mut(&hash).expect("a previous transaction");
          build.inputs.push(TxIn {
            previous_output: OutPoint {
              txid: Txid::from_slice(&txid).expect("a hash"),
              vout: input.prev_index,
            },
            script_sig: ScriptBuf::from_bytes(input.script_sig),
            sequence: Sequence(input.sequence),
            witness: Witness::new(),
          });
        }
        Err(_) => reply = Some(bad("Invalid previous input")),
      },
      Want::PrevOutput(hash, _) => match TxAckPrevOutput::decode(body) {
        Ok(ack) => {
          let output = ack.tx.output;
          let build = state.prev.get_mut(&hash).expect("a previous transaction");
          build.outputs.push(TxOut {
            value: Amount::from_sat(output.amount),
            script_pubkey: ScriptBuf::from_bytes(output.script_pubkey),
          });
        }
        Err(_) => reply = Some(bad("Invalid previous output")),
      },
    }
    match reply {
      Some(failure) => self.queue(session, &failure),
      None => self.ask_next(session),
    }
  }

  /// All data is in. The device checks it, shows it, and asks the user.
  fn all_collected(&mut self, session: u8) {
    let state = self.signing.as_ref().expect("a signing");
    // Every previous transaction must hash to what the inputs say.
    for (hash, build) in &state.prev {
      let tx = Transaction {
        version: transaction::Version(build.version as i32),
        lock_time: absolute::LockTime::from_consensus(build.lock_time),
        input: build.inputs.clone(),
        output: build.outputs.clone(),
      };
      let mut txid = tx.compute_txid().to_byte_array();
      txid.reverse();
      if txid.as_slice() != hash.as_slice() {
        self.signing = None;
        self.queue(
          session,
          &failure(FailureType::DataError, "Invalid prev_hash"),
        );
        return;
      }
    }
    for input in &state.inputs {
      let build = &state.prev[&input.prev_hash];
      match build.outputs.get(input.prev_index as usize) {
        Some(output) if output.value.to_sat() == input.amount => {}
        _ => {
          self.signing = None;
          self.queue(session, &failure(FailureType::DataError, "Invalid amount"));
          return;
        }
      }
    }
    if self.behavior.sign_mode == SignMode::Endless {
      self.queue(session, &tx_request(RequestType::Input, 0, None));
      self.signing.as_mut().expect("a signing").asked = Some(Want::Input(0));
      return;
    }
    self.after_button = Some(AfterButton::Transaction);
    self.queue(session, &ButtonRequest::default());
  }

  fn confirm_transaction(&mut self, session: u8) {
    let signatures = match self.behavior.sign_mode {
      SignMode::Cancel => {
        self.signing = None;
        self.queue(
          session,
          &failure(FailureType::ActionCancelled, "Action cancelled"),
        );
        return;
      }
      SignMode::NoSignatures => VecDeque::new(),
      mode => self.make_signatures(session, mode),
    };
    self.signing.as_mut().expect("a signing").signatures = Some(signatures);
    self.next_signature(session);
  }

  fn next_signature(&mut self, session: u8) {
    let state = self.signing.as_mut().expect("a signing");
    let signatures = state.signatures.as_mut().expect("signatures");
    let remaining = signatures.len();
    let (serialized, request_type, details) = match signatures.pop_front() {
      Some((index, signature)) => (
        Some(TxRequestSerializedType {
          signature_index: Some(index),
          signature: Some(signature),
        }),
        if remaining == 1 {
          RequestType::Finished
        } else {
          RequestType::Input
        },
        // The next input, as the real device asks while it signs.
        (remaining > 1).then(|| TxRequestDetailsType {
          request_index: Some(index + 1),
          tx_hash: None,
        }),
      ),
      None => (None, RequestType::Finished, None),
    };
    if request_type == RequestType::Finished {
      self.signing = None;
    }
    self.queue(
      session,
      &TxRequest {
        request_type: Some(request_type as i32),
        details,
        serialized,
      },
    );
  }

  /// The signatures of the device, as `(input index, DER)`.
  fn make_signatures(&mut self, session: u8, mode: SignMode) -> VecDeque<(u32, Vec<u8>)> {
    let secp = Secp256k1::new();
    let state = self.signing.as_ref().expect("a signing");
    let master = self.wallets[&session];

    // The transaction, from what the host sent.
    let output_script = |output: &TxOutput| match &output.multisig {
      Some(multisig) => ScriptBuf::new_p2wsh(&witness_script(multisig).wscript_hash()),
      None => Address::from_str(output.address.as_deref().expect("an address"))
        .expect("an address")
        .assume_checked()
        .script_pubkey(),
    };
    let transaction = Transaction {
      version: transaction::Version(state.tx.version.unwrap_or(1) as i32),
      lock_time: absolute::LockTime::from_consensus(state.tx.lock_time.unwrap_or(0)),
      input: state
        .inputs
        .iter()
        .map(|input| {
          let mut txid = input.prev_hash.clone();
          txid.reverse();
          TxIn {
            previous_output: OutPoint {
              txid: Txid::from_slice(&txid).expect("a hash"),
              vout: input.prev_index,
            },
            script_sig: ScriptBuf::new(),
            sequence: Sequence(input.sequence.unwrap_or(0xffff_ffff)),
            witness: Witness::new(),
          }
        })
        .collect(),
      output: state
        .outputs
        .iter()
        .map(|output| TxOut {
          value: Amount::from_sat(output.amount),
          script_pubkey: output_script(output),
        })
        .collect(),
    };

    let mut cache = SighashCache::new(&transaction);
    let mut signatures = VecDeque::new();
    for (index, input) in state.inputs.iter().enumerate() {
      let multisig = input.multisig.as_ref().expect("a multisig input");
      let script = witness_script(multisig);
      let sighash = cache
        .p2wsh_signature_hash(
          index,
          &script,
          Amount::from_sat(input.amount),
          EcdsaSighashType::All,
        )
        .expect("a hash");
      // The device's own key is the node of the multisig whose key is its account key. With the
      // wrong-key mode it signs with a key that is not in the vault.
      let key = if mode == SignMode::WrongKey {
        Xpriv::new_master(NetworkKind::Test, &[0x99; 32])
          .expect("a key")
          .private_key
      } else {
        let path = input
          .address_n
          .iter()
          .map(|n| ChildNumber::from(*n))
          .collect::<Vec<_>>();
        master
          .derive_priv(&secp, &DerivationPath::from(path))
          .expect("a path")
          .private_key
      };
      let signature = secp.sign_ecdsa(&SecpMessage::from_digest(sighash.to_byte_array()), &key);
      signatures.push_back((index as u32, signature.serialize_der().to_vec()));
    }
    signatures
  }
}

fn tx_request(request_type: RequestType, index: usize, hash: Option<Vec<u8>>) -> TxRequest {
  TxRequest {
    request_type: Some(request_type as i32),
    details: Some(TxRequestDetailsType {
      request_index: Some(index as u32),
      tx_hash: hash,
    }),
    serialized: None,
  }
}

/// The witness script of a multisig structure: the keys of the nodes at the address steps, in the
/// order of the nodes.
fn witness_script(multisig: &MultisigRedeemScriptType) -> ScriptBuf {
  use bitcoin::opcodes::all::OP_CHECKMULTISIG;
  let secp = Secp256k1::new();
  let steps: Vec<ChildNumber> = multisig
    .address_n
    .iter()
    .map(|n| ChildNumber::from(*n))
    .collect();
  let mut builder = bitcoin::script::Builder::new().push_int(i64::from(multisig.m));
  for node in &multisig.nodes {
    let key = bitcoin::secp256k1::PublicKey::from_slice(&node.public_key).expect("a key");
    let xpub = Xpub {
      network: NetworkKind::Test,
      depth: node.depth as u8,
      parent_fingerprint: bitcoin::bip32::Fingerprint::from(node.fingerprint.to_be_bytes()),
      child_number: ChildNumber::from(node.child_num),
      public_key: key,
      chain_code: bitcoin::bip32::ChainCode::from(
        <[u8; 32]>::try_from(node.chain_code.as_slice()).expect("a chain code"),
      ),
    };
    let derived = xpub.derive_pub(&secp, &steps).expect("a child key");
    builder = builder.push_key(&bitcoin::PublicKey::new(derived.public_key));
  }
  builder
    .push_int(multisig.nodes.len() as i64)
    .push_opcode(OP_CHECKMULTISIG)
    .into_script()
}
