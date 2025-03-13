use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug)]
pub enum DescriptorType {
  Receive,
  Change,
  Multipath,
}

impl std::fmt::Display for DescriptorType {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      DescriptorType::Receive => write!(f, "Receive"),
      DescriptorType::Change => write!(f, "Change"),
      DescriptorType::Multipath => write!(f, "Multipath"),
    }
  }
}

//https://github.com/bitcoin-core/HWI/blob/5f533aa7a4b332230ba7fef578f55a9d4a617ead/hwilib/errors.py#L15C1-L33C58
#[derive(Debug, Default)]
pub enum HwiErrorType {
  NoDeviceType = -1,           // Device type was not specified
  MissingArguments = -2,       // Arguments are missing
  DeviceConnError = -3,        // Error connecting to the device
  UnknownDeviceType = -4,      // Device type is unknown
  InvalidTx = -5,              // Transaction is invalid
  NoPassword = -6,             // No password provided, but one is needed
  BadArgument = -7,            // Bad, malformed, or conflicting argument was provided
  NotImplemented = -8,         // Function is not implemented
  UnavailableAction = -9,      // Function is not available for this device
  DeviceAlreadyInit = -10,     // Device is already initialized
  DeviceAlreadyUnlocked = -11, // Device is already unlocked
  DeviceNotReady = -12,        // Device is not ready
  UnknownError = -13,          // An unknown error occurred
  ActionCanceled = -14,        // Action was canceled by the user
  DeviceBusy = -15,            // Device is busy
  NeedToBeRoot = -16,          // User needs to be root to perform action
  HelpText = -17,              // Help text was requested by the user
  DeviceNotInitialized = -18,  // Device is not initialized
  #[default]
  UnknownHwiError = 0,
}

impl From<i32> for HwiErrorType {
  fn from(code: i32) -> Self {
    match code {
      -1 => Self::NoDeviceType,
      -2 => Self::MissingArguments,
      -3 => Self::DeviceConnError,
      -4 => Self::UnknownDeviceType,
      -5 => Self::InvalidTx,
      -6 => Self::NoPassword,
      -7 => Self::BadArgument,
      -8 => Self::NotImplemented,
      -9 => Self::UnavailableAction,
      -10 => Self::DeviceAlreadyInit,
      -11 => Self::DeviceAlreadyUnlocked,
      -12 => Self::DeviceNotReady,
      -13 => Self::UnknownError,
      -14 => Self::ActionCanceled,
      -15 => Self::DeviceBusy,
      -16 => Self::NeedToBeRoot,
      -17 => Self::HelpText,
      -18 => Self::DeviceNotInitialized,
      _ => Self::UnknownHwiError,
    }
  }
}

impl std::fmt::Display for HwiErrorType {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      HwiErrorType::NoDeviceType => write!(f, "NoDeviceType: Device type was not specified"),
      HwiErrorType::MissingArguments => write!(f, "MissingArguments: Arguments are missing"),
      HwiErrorType::DeviceConnError => write!(f, "DeviceConnError: Error connecting to the device"),
      HwiErrorType::UnknownDeviceType => write!(f, "UnknownDeviceType: Device type is unknown"),
      HwiErrorType::InvalidTx => write!(f, "InvalidTx: Transaction is invalid"),
      HwiErrorType::NoPassword => write!(f, "NoPassword: No password provided, but one is needed"),
      HwiErrorType::BadArgument => write!(
        f,
        "BadArgument: Bad, malformed, or conflicting argument was provided"
      ),
      HwiErrorType::NotImplemented => write!(f, "NotImplemented: Function is not implemented"),
      HwiErrorType::UnavailableAction => write!(
        f,
        "UnavailableAction: Function is not available for this device"
      ),
      HwiErrorType::DeviceAlreadyInit => {
        write!(f, "DeviceAlreadyInit: Device is already initialized")
      }
      HwiErrorType::DeviceAlreadyUnlocked => {
        write!(f, "DeviceAlreadyUnlocked: Device is already unlocked")
      }
      HwiErrorType::DeviceNotReady => write!(f, "DeviceNotReady: Device is not ready"),
      HwiErrorType::UnknownError => write!(
        f,
        "UnknownError: An unknown error occurred, device may have been disconnected."
      ),
      HwiErrorType::ActionCanceled => write!(f, "ActionCanceled: Action was canceled by the user"),
      HwiErrorType::DeviceBusy => write!(f, "DeviceBusy: Device is busy"),
      HwiErrorType::NeedToBeRoot => {
        write!(f, "NeedToBeRoot: User needs to be root to perform action")
      }
      HwiErrorType::HelpText => write!(f, "HelpText: Help text was requested by the user"),
      HwiErrorType::DeviceNotInitialized => {
        write!(f, "DeviceNotInitialized: Device is not initialized")
      }
      HwiErrorType::UnknownHwiError => write!(
        f,
        "UnknownHwiError: The error code from HWI is not recognized by tempura."
      ),
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
  FeeRateError,
  HwiError,
  NetworkError,
  ParseError,
  PsbtError,
  PsbtSignError,
  TransactionError,
  TransactionsError,
  WalletError,
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
      TempuraErrorType::FeeRateError => write!(f, "FeeRateError"),
      TempuraErrorType::HwiError => write!(f, "HwiError"),
      TempuraErrorType::NetworkError => write!(f, "NetworkError"),
      TempuraErrorType::ParseError => write!(f, "ParseError"),
      TempuraErrorType::PsbtError => write!(f, "PsbtError"),
      TempuraErrorType::PsbtSignError => write!(f, "PsbtSignError"),
      TempuraErrorType::TransactionError => write!(f, "TransactionError"),
      TempuraErrorType::TransactionsError => write!(f, "TransactionsError"),
      TempuraErrorType::WalletError => write!(f, "WalletError"),
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

  pub fn from_hwi_error_code(code: Option<i32>) -> Self {
    let hwi_error: HwiErrorType = match code {
      Some(code) => HwiErrorType::from(code),
      None => HwiErrorType::UnknownHwiError,
    };

    TempuraError::new(TempuraErrorType::HwiError, hwi_error.to_string().as_str())
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
    let response = String::from_utf8(o.stdout);
    #[cfg(debug_assertions)]
    println!("{:?}", response);
    resolve!(response, TempuraErrorType::ParseError)
  }};
}
