// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// tauri and other framework imports
use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Typescript;
use tauri::State;

// std rust imports
use std::sync::{Arc, Mutex};

// bdk and bitcoin imports
use bdk::bitcoin::secp256k1::Secp256k1;
use bdk::bitcoin::Network;
use bdk::blockchain::ElectrumBlockchain;
use bdk::database::MemoryDatabase;
use bdk::descriptor::{ExtendedDescriptor, IntoWalletDescriptor};
use bdk::electrum_client::Client;
use bdk::SyncOptions;
use bdk::{self, wallet};

#[derive(Default, Serialize, Deserialize, Type)]
enum DescriptorResponse {
    #[default]
    None,
    Testnet,
    Mainnet,
}

// TODO: add a way to manually set the network
#[derive(Default)]
struct AppState {
    wallet: Option<bdk::Wallet<MemoryDatabase>>,
    network: Option<Network>,
}

#[tauri::command]
#[specta::specta]
fn reset(state: State<Mutex<AppState>>) {
    let mut state = state.lock().unwrap();
    state.wallet = None;
}

#[tauri::command]
#[specta::specta]
fn verify_descriptor(descriptor: String) -> Result<DescriptorResponse, String> {
    let secp = Secp256k1::new();

    // TODO: this isn't sufficient since some descriptors are valid for both mainnet and testnet
    // example: wpkh(03d99179113327fc2a8349b4d47d1eac3033b51cbddcb59654c894320850500d4e)
    let is_testnet = descriptor.contains("tpub") || descriptor.contains("tprv");
    let network = match is_testnet {
        true => Network::Testnet,
        false => Network::Bitcoin,
    };

    match descriptor.into_wallet_descriptor(&secp, network) {
        Ok(_) => {}
        Err(e) => return Err(e.to_string()),
    };

    Ok(match is_testnet {
        true => DescriptorResponse::Testnet,
        false => DescriptorResponse::Mainnet,
    })
}

#[tauri::command]
#[specta::specta]
fn set_wallet(
    state: State<Mutex<AppState>>,
    receive: String,
    change: String,
) -> Result<(), String> {
    let mut state = state.lock().unwrap();

    // TODO: this isn't sufficient since some descriptors are valid for both mainnet and testnet
    // example: wpkh(03d99179113327fc2a8349b4d47d1eac3033b51cbddcb59654c894320850500d4e)
    let is_testnet = receive.contains("tpub") || receive.contains("tprv");
    let network = match is_testnet {
        true => Network::Testnet,
        false => Network::Bitcoin,
    };

    let secp = Secp256k1::new();
    let receive = match receive.into_wallet_descriptor(&secp, network) {
        Ok(_) => receive.to_string(),
        Err(e) => return Err(e.to_string()),
    };

    let binding = change.to_string();
    let change = match change.into_wallet_descriptor(&secp, network) {
        Ok(_) => Some(&binding),
        Err(_) => None,
    };
    let wallet = match bdk::Wallet::new(
        &receive,
        change,
        network,
        bdk::database::MemoryDatabase::default(),
    ) {
        Ok(wallet) => wallet,
        Err(e) => return Err(e.to_string()),
    };

    state.wallet = Some(wallet);
    state.network = Some(network);
    Ok(())
}

#[tauri::command]
#[specta::specta]
async fn fetch_balance(state: State<'_, Mutex<AppState>>) -> Result<String, String> {
    let state = state.lock().unwrap();

    let network = state.network.as_ref().ok_or("No network set")?.to_owned();
    let wallet = state.wallet.as_ref().ok_or("No wallet set")?;

    let connection = match network {
        Network::Testnet => "electrum.blockstream.info:60001",
        Network::Bitcoin => "blockstream.info:110",
        _ => return Err("Unsupported network".to_string()),
    };
    let client = Client::new(connection).unwrap();
    let blockchain: ElectrumBlockchain = ElectrumBlockchain::from(client);

    // Execute blocking wallet sync and balance retrieval in a separate thread context.
    tokio::task::block_in_place(|| {
        wallet
            .sync(&blockchain, SyncOptions::default())
            .map_err(|e| e.to_string())?;

        let balance = wallet.get_balance().map_err(|e| e.to_string())?;

        // TODO: Return the bdk::Balance struct instead of just the confirmed balance string
        Ok(balance.confirmed.to_string())
    })
}

fn main() {
    // let app_state: Arc<Mutex<AppState>> = Arc::new(Mutex::new(AppState::default()));
    let app_state: Mutex<AppState> = Mutex::new(AppState::default());
    // let app_state = AppState::default();

    let specta_builder =
        tauri_specta::Builder::<tauri::Wry>::new().commands(tauri_specta::collect_commands![
            fetch_balance,
            reset,
            set_wallet,
            verify_descriptor
        ]);

    #[cfg(debug_assertions)] // <- Only export on non-release builds
    specta_builder
        .export(Typescript::default(), "../src/bindings.ts")
        .expect("Failed to export typescript bindings");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(specta_builder.invoke_handler())
        .setup(move |app| {
            // This is also required if you want to use events
            specta_builder.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
