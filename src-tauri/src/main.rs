// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::str::FromStr;

use bdk::database::MemoryDatabase;
// tauri and other framework imports
use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Typescript;

// use bitcoin::Network;

// bdk and bitcoin imports
use bdk;
use bdk::bitcoin::secp256k1::Secp256k1;
use bdk::bitcoin::Network;
use bdk::blockchain::ElectrumBlockchain;
use bdk::descriptor::IntoWalletDescriptor;
use bdk::electrum_client::Client;
use bdk::SyncOptions;

#[derive(Debug)]
pub enum DescriptorType {
  Receive,
  Change,
}

impl std::fmt::Display for DescriptorType {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      DescriptorType::Receive => write!(f, "Receive"),
      DescriptorType::Change => write!(f, "Change"),
    }
  }
}

#[derive(Debug, Default)]
pub enum TempuraErrorType {
  AddressError,
  BalanceError,
  BlockchainError,
  ClientError,
  DescriptorError(DescriptorType),
  DeviceError,
  NetworkError,
  PsbtError,
  PsbtSignError,
  TransactionError,
  WalletSyncError,
  #[default]
  UnknownError,
}

impl std::fmt::Display for TempuraErrorType {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      TempuraErrorType::AddressError => write!(f, "AddressError"),
      TempuraErrorType::BalanceError => write!(f, "BalanceError"),
      TempuraErrorType::BlockchainError => write!(f, "BlockchainError"),
      TempuraErrorType::ClientError => write!(f, "ClientError"),
      TempuraErrorType::DescriptorError(t) => write!(f, "DescriptorError({})", t),
      TempuraErrorType::DeviceError => write!(f, "DeviceError"),
      TempuraErrorType::NetworkError => write!(f, "NetworkError"),
      TempuraErrorType::PsbtError => write!(f, "PsbtError"),
      TempuraErrorType::PsbtSignError => write!(f, "PsbtSignError"),
      TempuraErrorType::TransactionError => write!(f, "TransactionError"),
      TempuraErrorType::WalletSyncError => write!(f, "WalletSyncError"),
      TempuraErrorType::UnknownError => write!(f, "UnknownError"),
    }
  }
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct TempuraError {
  pub error_type: String,
  pub message: String,
}

impl TempuraError {
  pub fn new(error_type: TempuraErrorType, message: &str) -> Self {
    TempuraError {
      error_type: error_type.to_string(),
      message: message.to_string(),
    }
  }
}

macro_rules! resolve {
  ($expr:expr, $error_type:expr) => {
    $expr.map_err(|e| TempuraError::new($error_type, &e.to_string()))?
  };
}

fn get_blockchain(
  network: Network,
  electrum: Option<String>,
) -> Result<ElectrumBlockchain, TempuraError> {
  let connection = match electrum {
    Some(electrum) => electrum,
    None => match network {
      Network::Testnet => "electrum.blockstream.info:60001".to_string(),
      Network::Bitcoin => "blockstream.info:110".to_string(),
      _ => {
        return Err(TempuraError::new(
          TempuraErrorType::NetworkError,
          "Unsupported network",
        ))
      }
    },
  };

  let client = resolve!(Client::new(&connection), TempuraErrorType::ClientError);
  Ok(ElectrumBlockchain::from(client))
}

fn get_network(network: String) -> Result<Network, TempuraError> {
  match network.as_ref() {
    "bitcoin" => Ok(Network::Bitcoin),
    "testnet" => Ok(Network::Testnet),
    "regtest" => Ok(Network::Regtest),
    other => Err(TempuraError::new(
      TempuraErrorType::NetworkError,
      format!("Unsupported network: {}", other).as_str(),
    )),
  }
}

fn get_wallet(
  network: Network,
  receive: String,
  change: Option<String>,
) -> Result<bdk::Wallet<MemoryDatabase>, TempuraError> {
  let secp = Secp256k1::new();
  let receive = resolve!(
    receive.into_wallet_descriptor(&secp, network),
    TempuraErrorType::DescriptorError(DescriptorType::Receive)
  );
  let change = match change {
    Some(change) => Some(resolve!(
      change.into_wallet_descriptor(&secp, network),
      TempuraErrorType::DescriptorError(DescriptorType::Change)
    )),
    None => None,
  };

  Ok(resolve!(
    bdk::Wallet::new(
      receive,
      change,
      network,
      bdk::database::MemoryDatabase::default()
    ),
    TempuraErrorType::ClientError
  ))
}

#[derive(Default, Serialize, Deserialize, Type)]
pub struct AddressInfo {
  pub index: u32,
  pub address: String,
}

impl From<bdk::wallet::AddressInfo> for AddressInfo {
  fn from(addrinfo: bdk::wallet::AddressInfo) -> Self {
    Self {
      index: addrinfo.index,
      address: addrinfo.address.to_string(),
    }
  }
}

#[tauri::command]
#[specta::specta]
async fn address(
  network: String,
  descriptor: String,
  electrum: Option<String>,
) -> Result<AddressInfo, TempuraError> {
  let network = get_network(network)?;
  let blockchain = get_blockchain(network, electrum)?;
  let wallet = get_wallet(network, descriptor, None)?;

  // Execute blocking wallet sync and balance retrieval in a separate thread context.
  tokio::task::block_in_place(|| {
    resolve!(
      wallet.sync(&blockchain, SyncOptions::default()),
      TempuraErrorType::WalletSyncError
    );

    let addr = resolve!(
      wallet.get_address(bdk::wallet::AddressIndex::LastUnused),
      TempuraErrorType::AddressError
    );
    Ok(addr.into())
  })
}

// this type is copied from BDK so that we can specta-derive it,
// but unfortunately u64 is not supported, so we must convert to string.
#[derive(Default, Serialize, Deserialize, Type)]
struct Balance {
  /// All coinbase outputs not yet matured
  pub immature: String,
  /// Unconfirmed UTXOs generated by a wallet tx
  pub trusted_pending: String,
  /// Unconfirmed UTXOs received from an external wallet
  pub untrusted_pending: String,
  /// Confirmed and immediately spendable balance
  pub confirmed: String,
}

impl From<bdk::Balance> for Balance {
  fn from(balance: bdk::Balance) -> Self {
    Balance {
      immature: balance.immature.to_string(),
      trusted_pending: balance.trusted_pending.to_string(),
      untrusted_pending: balance.untrusted_pending.to_string(),
      confirmed: balance.confirmed.to_string(),
    }
  }
}

#[tauri::command]
#[specta::specta]
async fn balance(
  network: String,
  receive: String,
  change: Option<String>,
  electrum: Option<String>,
) -> Result<Balance, TempuraError> {
  let network = get_network(network)?;
  let blockchain = get_blockchain(network, electrum)?;
  let wallet = get_wallet(network, receive, change)?;

  // Execute blocking wallet sync and balance retrieval in a separate thread context.
  tokio::task::block_in_place(|| {
    resolve!(
      wallet.sync(&blockchain, SyncOptions::default()),
      TempuraErrorType::WalletSyncError
    );

    let balance: bdk::Balance = resolve!(wallet.get_balance(), TempuraErrorType::BalanceError);

    Ok(balance.into())
  })
}

#[tauri::command]
#[specta::specta]
async fn broadcast(
  psbt: String,
  network: String,
  receive: String,
  change: Option<String>,
  electrum: Option<String>,
) -> Result<(), TempuraError> {
  let network = get_network(network)?;
  let blockchain = get_blockchain(network, electrum)?;
  let wallet = get_wallet(network, receive, change)?;

  let mut psbt = resolve!(
    bdk::bitcoin::psbt::PartiallySignedTransaction::from_str(&psbt),
    TempuraErrorType::PsbtError
  );

  if !resolve!(
    wallet.finalize_psbt(&mut psbt, bdk::SignOptions::default()),
    TempuraErrorType::PsbtError
  ) {
    return Err(TempuraError::new(
      TempuraErrorType::PsbtError,
      "Failed to finalize PSBT",
    ));
  }

  let tx = psbt.extract_tx();
  Ok(resolve!(
    bdk::blockchain::Blockchain::broadcast(&blockchain, &tx),
    TempuraErrorType::TransactionError
  ))
}

#[tauri::command]
#[specta::specta]
async fn sign(psbt: String, network: String) -> Result<String, TempuraError> {
  println!("network b4: {:?}", network);
  let network = get_network(network)?;
  println!("network: {:?}", network);
  let psbt = resolve!(
    bdk::bitcoin::psbt::PartiallySignedTransaction::from_str(&psbt),
    TempuraErrorType::PsbtError
  );

  let mut devices = resolve!(hwi::HWIClient::enumerate(), TempuraErrorType::DeviceError);
  println!("num devices: {}", devices.len());

  if devices.is_empty() {
    return Err(TempuraError::new(
      TempuraErrorType::DeviceError,
      "No devices found",
    ));
  }

  let first_device = resolve!(devices.swap_remove(0), TempuraErrorType::DeviceError);
  println!("first_device: {:?}", first_device);
  let client = resolve!(
    hwi::HWIClient::get_client(&first_device, true, network.into()),
    TempuraErrorType::DeviceError
  );

  let psbt = resolve!(client.sign_tx(&psbt), TempuraErrorType::PsbtSignError);
  println!("psbt: {:?}", psbt);
  Ok(psbt.psbt.to_string())
}

// again, unfortunately u64 is not supported, so we must convert to string for number values.
#[derive(Default, Serialize, Deserialize, Type)]
pub struct PsbtDetails {
  pub psbt: String,
  pub txid: String,
  pub received: String,
  pub sent: String,
  pub fee: Option<String>,
}

impl PsbtDetails {
  pub fn new(psbt: String, details: bdk::TransactionDetails) -> Self {
    PsbtDetails {
      psbt: psbt,
      txid: details.txid.to_string(),
      received: details.received.to_string(),
      sent: details.sent.to_string(),
      fee: match details.fee {
        None => None,
        Some(fee) => Some(fee.to_string()),
      },
    }
  }
}

#[tauri::command]
#[specta::specta]
async fn sweep(
  address: String,
  fee_rate: f32,
  network: String,
  receive: String,
  change: Option<String>,
  electrum: Option<String>,
) -> Result<PsbtDetails, TempuraError> {
  let network = get_network(network)?;
  let blockchain = get_blockchain(network, electrum)?;
  let wallet = get_wallet(network, receive, change)?;

  // Execute blocking wallet sync and balance retrieval in a separate thread context.
  tokio::task::block_in_place(|| {
    resolve!(
      wallet.sync(&blockchain, SyncOptions::default()),
      TempuraErrorType::WalletSyncError
    );

    let mut builder = wallet.build_tx();
    let addr = resolve!(
      bdk::bitcoin::Address::from_str(&address),
      TempuraErrorType::AddressError
    );
    // check that recipient is on the same network as the wallet
    if addr.network != wallet.network() {
      return Err(TempuraError::new(
        TempuraErrorType::AddressError,
        &format!(
          "Mismatched address and network. address: {}, network: {}",
          address, network
        ),
      ));
    }
    builder.drain_wallet();
    builder.drain_to(addr.payload.script_pubkey());
    builder.enable_rbf();
    builder.fee_rate(bdk::FeeRate::from_sat_per_vb(fee_rate));

    let (psbt, details) = resolve!(builder.finish(), TempuraErrorType::TransactionError);
    Ok(PsbtDetails::new(psbt.to_string(), details))
  })
}

fn main() {
  let specta_builder: tauri_specta::Builder =
    tauri_specta::Builder::<tauri::Wry>::new().commands(tauri_specta::collect_commands![
      address, balance, broadcast, sign, sweep
    ]);

  // disable Specta wrapping Results into javascript objects with {status : 'ok' | 'error'}
  let specta_builder = specta_builder.error_handling(tauri_specta::ErrorHandlingMode::Throw);

  #[cfg(debug_assertions)] // <- Only export on non-release builds
  specta_builder
    .export(Typescript::default(), "../src/bindings.ts")
    .expect("Failed to export typescript bindings");

  tauri::Builder::default()
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(specta_builder.invoke_handler())
    .setup(move |app| {
      specta_builder.mount_events(app);
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
