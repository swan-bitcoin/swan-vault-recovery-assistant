use serde::{Deserialize, Serialize};
use specta::Type;

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

#[macro_export]
macro_rules! resolve {
  ($expr:expr, $error_type:expr) => {
    $expr.map_err(|e| TempuraError::new($error_type, &e.to_string()))?
  };
}
