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
  CommandError,
  DescriptorError(Option<DescriptorType>),
  DeviceError,
  NetworkError,
  ParseError,
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
      TempuraErrorType::CommandError => write!(f, "CommandError"),
      TempuraErrorType::DescriptorError(t) => match t {
        Some(t) => write!(f, "DescriptorError({})", t),
        None => write!(f, "DescriptorError"),
      },
      TempuraErrorType::DeviceError => write!(f, "DeviceError"),
      TempuraErrorType::NetworkError => write!(f, "NetworkError"),
      TempuraErrorType::ParseError => write!(f, "ParseError"),
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

#[macro_export]
macro_rules! resolve_io {
  ($expr:expr) => {{
    let o = $expr.output().map_err(|e| {
      if e.kind() == std::io::ErrorKind::NotFound {
        return TempuraError::new(
          TempuraErrorType::CommandError,
          "HWI executable not found in PATH or working directory.",
        );
      }
      TempuraError::new(TempuraErrorType::CommandError, &e.to_string())
    })?;
    resolve!(String::from_utf8(o.stdout), TempuraErrorType::ParseError)
  }};
}
