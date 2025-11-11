use crate::errors::{SvraError, SvraErrorType};

#[derive(Clone, Copy, Debug)]
pub enum Network {
  Bitcoin,
  Testnet,
  Signet,
  Regtest,
}

impl std::fmt::Display for Network {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      Network::Bitcoin => write!(f, "bitcoin"),
      Network::Testnet => write!(f, "testnet"),
      Network::Signet => write!(f, "signet"),
      Network::Regtest => write!(f, "regtest"),
    }
  }
}

impl std::str::FromStr for Network {
  type Err = SvraError;

  fn from_str(s: &str) -> Result<Self, Self::Err> {
    match s {
      "bitcoin" => Ok(Network::Bitcoin),
      "testnet" => Ok(Network::Testnet),
      "signet" => Ok(Network::Signet),
      "regtest" => Ok(Network::Regtest),
      other => Err(SvraError::new(
        SvraErrorType::NetworkError,
        format!("Unsupported network: {}", other).as_str(),
      )),
    }
  }
}

impl From<Network> for bdk_wallet::bitcoin::Network {
  fn from(network: Network) -> Self {
    match network {
      Network::Bitcoin => bdk_wallet::bitcoin::Network::Bitcoin,
      Network::Testnet => bdk_wallet::bitcoin::Network::Testnet,
      Network::Signet => bdk_wallet::bitcoin::Network::Signet,
      Network::Regtest => bdk_wallet::bitcoin::Network::Regtest,
    }
  }
}

#[derive(Debug, Clone)]
pub struct HwiNetwork(String);

impl HwiNetwork {
  pub fn as_str(&self) -> &str {
    &self.0
  }
}

impl From<Network> for HwiNetwork {
  fn from(network: Network) -> Self {
    let network = match network {
      Network::Bitcoin => "main",
      Network::Testnet => "test",
      Network::Regtest => "regtest",
      Network::Signet => "signet",
    };
    HwiNetwork(network.to_string())
  }
}
