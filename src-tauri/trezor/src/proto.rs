//! The messages of the Safe 7 that SVRA sends and reads, written by hand with `prost`.
//!
//! Each struct copies a message of the firmware's `common/protob` files (release 2.13.1) with the
//! same field numbers, and only the fields that SVRA uses. The firmware's files are proto2, so
//! repeated numbers are not packed, and a `required` field is always written. A field that the
//! device sends and SVRA does not read is skipped when the message is decoded.

use prost::{Enumeration, Message};

/// A message with its type number on the wire. The number is the `MessageType` value of the
/// firmware's `messages.proto`.
pub(crate) trait Wire: Message + Default {
  const TYPE: u16;
}

macro_rules! wire {
  ($($message:ty => $number:expr),* $(,)?) => {
    $(impl Wire for $message {
      const TYPE: u16 = $number;
    })*
  };
}

// ---------------------------------------------------------------------------------------------
// messages-thp.proto

#[derive(Clone, Copy, Debug, PartialEq, Eq, Enumeration)]
#[repr(i32)]
pub(crate) enum ThpPairingMethod {
  SkipPairing = 1,
  CodeEntry = 2,
  QrCode = 3,
  Nfc = 4,
}

/// What the device sends in the channel allocation response. The handshake hashes these bytes
/// into the channel keys, so the host reads them and never rewrites them.
#[derive(Clone, PartialEq, Message)]
pub(crate) struct ThpDeviceProperties {
  #[prost(string, required, tag = "1")]
  pub internal_model: String,
  #[prost(uint32, optional, tag = "2")]
  pub model_variant: Option<u32>,
  #[prost(uint32, required, tag = "3")]
  pub protocol_version_major: u32,
  #[prost(uint32, required, tag = "4")]
  pub protocol_version_minor: u32,
  #[prost(
    enumeration = "ThpPairingMethod",
    repeated,
    packed = "false",
    tag = "5"
  )]
  pub pairing_methods: Vec<i32>,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct ThpCreateNewSession {
  #[prost(string, optional, tag = "1")]
  pub passphrase: Option<String>,
  #[prost(bool, optional, tag = "2")]
  pub on_device: Option<bool>,
  #[prost(bool, optional, tag = "3")]
  pub derive_cardano: Option<bool>,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct ThpPairingRequest {
  #[prost(string, required, tag = "1")]
  pub host_name: String,
  #[prost(string, required, tag = "2")]
  pub app_name: String,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct ThpPairingRequestApproved {}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct ThpSelectMethod {
  #[prost(enumeration = "ThpPairingMethod", required, tag = "1")]
  pub selected_pairing_method: i32,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct ThpCodeEntryCommitment {
  #[prost(bytes = "vec", required, tag = "1")]
  pub commitment: Vec<u8>,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct ThpCodeEntryChallenge {
  #[prost(bytes = "vec", required, tag = "1")]
  pub challenge: Vec<u8>,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct ThpCodeEntryCpaceTrezor {
  #[prost(bytes = "vec", required, tag = "1")]
  pub cpace_trezor_public_key: Vec<u8>,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct ThpCodeEntryCpaceHostTag {
  #[prost(bytes = "vec", required, tag = "1")]
  pub cpace_host_public_key: Vec<u8>,
  #[prost(bytes = "vec", required, tag = "2")]
  pub tag: Vec<u8>,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct ThpCodeEntrySecret {
  #[prost(bytes = "vec", required, tag = "1")]
  pub secret: Vec<u8>,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct ThpEndRequest {}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct ThpEndResponse {}

wire! {
  ThpCreateNewSession => 1000,
  ThpPairingRequest => 1008,
  ThpPairingRequestApproved => 1009,
  ThpSelectMethod => 1010,
  ThpEndRequest => 1018,
  ThpEndResponse => 1019,
  ThpCodeEntryCommitment => 1024,
  ThpCodeEntryChallenge => 1025,
  ThpCodeEntryCpaceTrezor => 1026,
  ThpCodeEntryCpaceHostTag => 1027,
  ThpCodeEntrySecret => 1028,
}

// ---------------------------------------------------------------------------------------------
// messages-common.proto

#[derive(Clone, PartialEq, Message)]
pub(crate) struct Success {
  #[prost(string, optional, tag = "1")]
  pub message: Option<String>,
}

/// `Failure.FailureType`. The device may send a value that this list lacks, so [`Failure::code`]
/// is a plain number.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Enumeration)]
#[repr(i32)]
pub(crate) enum FailureType {
  UnexpectedMessage = 1,
  ButtonExpected = 2,
  DataError = 3,
  ActionCancelled = 4,
  PinExpected = 5,
  PinCancelled = 6,
  PinInvalid = 7,
  InvalidSignature = 8,
  ProcessError = 9,
  NotEnoughFunds = 10,
  NotInitialized = 11,
  PinMismatch = 12,
  WipeCodeMismatch = 13,
  InvalidSession = 14,
  Busy = 15,
  ThpUnallocatedSession = 16,
  InvalidProtocol = 17,
  InProgress = 19,
  FirmwareError = 99,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct Failure {
  #[prost(enumeration = "FailureType", optional, tag = "1")]
  pub code: Option<i32>,
  #[prost(string, optional, tag = "2")]
  pub message: Option<String>,
}

/// The device's request for the user's decision. Its `code`, `pages` and `name` say which screen
/// it is, and SVRA acknowledges every one of them in the same way, so it reads none of them.
#[derive(Clone, PartialEq, Message)]
pub(crate) struct ButtonRequest {}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct ButtonAck {}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct Cancel {}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct HdNodeType {
  #[prost(uint32, required, tag = "1")]
  pub depth: u32,
  #[prost(uint32, required, tag = "2")]
  pub fingerprint: u32,
  #[prost(uint32, required, tag = "3")]
  pub child_num: u32,
  #[prost(bytes = "vec", required, tag = "4")]
  pub chain_code: Vec<u8>,
  #[prost(bytes = "vec", required, tag = "6")]
  pub public_key: Vec<u8>,
}

wire! {
  Success => 2,
  Failure => 3,
  Cancel => 20,
  ButtonRequest => 26,
  ButtonAck => 27,
}

// ---------------------------------------------------------------------------------------------
// messages-management.proto

#[derive(Clone, PartialEq, Message)]
pub(crate) struct GetFeatures {}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct Features {
  #[prost(uint32, required, tag = "2")]
  pub major_version: u32,
  #[prost(uint32, required, tag = "3")]
  pub minor_version: u32,
  #[prost(uint32, required, tag = "4")]
  pub patch_version: u32,
  #[prost(bool, optional, tag = "5")]
  pub bootloader_mode: Option<bool>,
  #[prost(bool, optional, tag = "8")]
  pub passphrase_protection: Option<bool>,
  #[prost(bool, optional, tag = "12")]
  pub initialized: Option<bool>,
  #[prost(bool, optional, tag = "16")]
  pub unlocked: Option<bool>,
  #[prost(bool, optional, tag = "18")]
  pub firmware_present: Option<bool>,
  #[prost(bool, optional, tag = "36")]
  pub passphrase_always_on_device: Option<bool>,
  #[prost(string, optional, tag = "44")]
  pub internal_model: Option<String>,
}

wire! {
  GetFeatures => 55,
  Features => 17,
}

// ---------------------------------------------------------------------------------------------
// messages-bitcoin.proto

#[derive(Clone, Copy, Debug, PartialEq, Eq, Enumeration)]
#[repr(i32)]
pub(crate) enum InputScriptType {
  SpendWitness = 3,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Enumeration)]
#[repr(i32)]
pub(crate) enum OutputScriptType {
  PayToAddress = 0,
  PayToWitness = 4,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Enumeration)]
#[repr(i32)]
pub(crate) enum MultisigPubkeysOrder {
  Preserved = 0,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct MultisigRedeemScriptType {
  #[prost(bytes = "vec", repeated, tag = "2")]
  pub signatures: Vec<Vec<u8>>,
  #[prost(uint32, required, tag = "3")]
  pub m: u32,
  #[prost(message, repeated, tag = "4")]
  pub nodes: Vec<HdNodeType>,
  #[prost(uint32, repeated, packed = "false", tag = "5")]
  pub address_n: Vec<u32>,
  #[prost(enumeration = "MultisigPubkeysOrder", optional, tag = "6")]
  pub pubkeys_order: Option<i32>,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct GetPublicKey {
  #[prost(uint32, repeated, packed = "false", tag = "1")]
  pub address_n: Vec<u32>,
  #[prost(bool, optional, tag = "3")]
  pub show_display: Option<bool>,
  #[prost(string, optional, tag = "4")]
  pub coin_name: Option<String>,
  #[prost(enumeration = "InputScriptType", optional, tag = "5")]
  pub script_type: Option<i32>,
  #[prost(bool, optional, tag = "6")]
  pub ignore_xpub_magic: Option<bool>,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct PublicKey {
  #[prost(message, required, tag = "1")]
  pub node: HdNodeType,
  #[prost(string, required, tag = "2")]
  pub xpub: String,
  #[prost(uint32, optional, tag = "3")]
  pub root_fingerprint: Option<u32>,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct SignTx {
  #[prost(uint32, required, tag = "1")]
  pub outputs_count: u32,
  #[prost(uint32, required, tag = "2")]
  pub inputs_count: u32,
  #[prost(string, optional, tag = "3")]
  pub coin_name: Option<String>,
  #[prost(uint32, optional, tag = "4")]
  pub version: Option<u32>,
  #[prost(uint32, optional, tag = "5")]
  pub lock_time: Option<u32>,
  #[prost(bool, optional, tag = "13")]
  pub serialize: Option<bool>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Enumeration)]
#[repr(i32)]
pub(crate) enum RequestType {
  Input = 0,
  Output = 1,
  Meta = 2,
  Finished = 3,
  ExtraData = 4,
  OrigInput = 5,
  OrigOutput = 6,
  PaymentReq = 7,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct TxRequestDetailsType {
  #[prost(uint32, optional, tag = "1")]
  pub request_index: Option<u32>,
  #[prost(bytes = "vec", optional, tag = "2")]
  pub tx_hash: Option<Vec<u8>>,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct TxRequestSerializedType {
  #[prost(uint32, optional, tag = "1")]
  pub signature_index: Option<u32>,
  #[prost(bytes = "vec", optional, tag = "2")]
  pub signature: Option<Vec<u8>>,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct TxRequest {
  #[prost(enumeration = "RequestType", optional, tag = "1")]
  pub request_type: Option<i32>,
  #[prost(message, optional, tag = "2")]
  pub details: Option<TxRequestDetailsType>,
  #[prost(message, optional, tag = "3")]
  pub serialized: Option<TxRequestSerializedType>,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct TxInput {
  #[prost(uint32, repeated, packed = "false", tag = "1")]
  pub address_n: Vec<u32>,
  #[prost(bytes = "vec", required, tag = "2")]
  pub prev_hash: Vec<u8>,
  #[prost(uint32, required, tag = "3")]
  pub prev_index: u32,
  #[prost(uint32, optional, tag = "5")]
  pub sequence: Option<u32>,
  #[prost(enumeration = "InputScriptType", optional, tag = "6")]
  pub script_type: Option<i32>,
  #[prost(message, optional, tag = "7")]
  pub multisig: Option<MultisigRedeemScriptType>,
  #[prost(uint64, required, tag = "8")]
  pub amount: u64,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct TxOutput {
  #[prost(string, optional, tag = "1")]
  pub address: Option<String>,
  #[prost(uint32, repeated, packed = "false", tag = "2")]
  pub address_n: Vec<u32>,
  #[prost(uint64, required, tag = "3")]
  pub amount: u64,
  #[prost(enumeration = "OutputScriptType", optional, tag = "4")]
  pub script_type: Option<i32>,
  #[prost(message, optional, tag = "5")]
  pub multisig: Option<MultisigRedeemScriptType>,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct PrevTx {
  #[prost(uint32, required, tag = "1")]
  pub version: u32,
  #[prost(uint32, required, tag = "4")]
  pub lock_time: u32,
  #[prost(uint32, required, tag = "6")]
  pub inputs_count: u32,
  #[prost(uint32, required, tag = "7")]
  pub outputs_count: u32,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct PrevInput {
  #[prost(bytes = "vec", required, tag = "2")]
  pub prev_hash: Vec<u8>,
  #[prost(uint32, required, tag = "3")]
  pub prev_index: u32,
  #[prost(bytes = "vec", required, tag = "4")]
  pub script_sig: Vec<u8>,
  #[prost(uint32, required, tag = "5")]
  pub sequence: u32,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct PrevOutput {
  #[prost(uint64, required, tag = "1")]
  pub amount: u64,
  #[prost(bytes = "vec", required, tag = "2")]
  pub script_pubkey: Vec<u8>,
}

// The device sends one `TxAck` type number for every answer. The firmware's `TxAck*` messages
// differ in which part of the old `TransactionType` they fill, so each one has its own struct.

#[derive(Clone, PartialEq, Message)]
pub(crate) struct TxAckInputWrapper {
  #[prost(message, required, tag = "2")]
  pub input: TxInput,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct TxAckInput {
  #[prost(message, required, tag = "1")]
  pub tx: TxAckInputWrapper,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct TxAckOutputWrapper {
  #[prost(message, required, tag = "5")]
  pub output: TxOutput,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct TxAckOutput {
  #[prost(message, required, tag = "1")]
  pub tx: TxAckOutputWrapper,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct TxAckPrevMeta {
  #[prost(message, required, tag = "1")]
  pub tx: PrevTx,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct TxAckPrevInputWrapper {
  #[prost(message, required, tag = "2")]
  pub input: PrevInput,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct TxAckPrevInput {
  #[prost(message, required, tag = "1")]
  pub tx: TxAckPrevInputWrapper,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct TxAckPrevOutputWrapper {
  #[prost(message, required, tag = "3")]
  pub output: PrevOutput,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct TxAckPrevOutput {
  #[prost(message, required, tag = "1")]
  pub tx: TxAckPrevOutputWrapper,
}

wire! {
  GetPublicKey => 11,
  PublicKey => 12,
  SignTx => 15,
  TxRequest => 21,
  TxAckInput => 22,
  TxAckOutput => 22,
  TxAckPrevMeta => 22,
  TxAckPrevInput => 22,
  TxAckPrevOutput => 22,
}
