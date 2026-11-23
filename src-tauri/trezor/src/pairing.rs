//! Code-entry pairing. The device shows a 6-digit code, the user types it into the app, and both
//! sides prove to each other that they know it (see [`crate::cpace`]). Nothing from the pairing
//! is stored: the user types a new code on every run.

use crate::cpace;
use crate::device::Device;
use crate::device_error::{failure_error, link_error, unexpected_message, Step};
use crate::error::{Error, ErrorKind};
use crate::link::{random_bytes, Deadline, LinkError, QUICK, USER};
use crate::proto::{
  Failure, ThpCodeEntryChallenge, ThpCodeEntryCommitment, ThpCodeEntryCpaceHostTag,
  ThpCodeEntryCpaceTrezor, ThpCodeEntrySecret, ThpEndRequest, ThpEndResponse, ThpPairingMethod,
  ThpPairingRequest, ThpPairingRequestApproved, ThpSelectMethod, Wire,
};
use crate::session::{CodeEntry, Progress};
use crate::transport::Transport;
use prost::Message;
use std::time::Duration;
use zeroize::Zeroizing;

/// What the device shows when it asks the user to allow the connection. The screen reads
/// "Allow {APP_NAME} on {HOST_NAME} to pair with this Trezor?", and the code screen reads
/// "Enter this one-time security code on {HOST_NAME}".
pub(crate) const APP_NAME: &str = "Swan Vault Recovery Assistant";
pub(crate) const HOST_NAME: &str = "this computer";

/// The session number of everything that comes before the wallet sessions.
pub(crate) const MANAGEMENT_SESSION: u8 = 0;

/// How long one turn of the wait for the code lasts: once for the user, and once for the device.
const CODE_POLL: Duration = Duration::from_millis(100);
/// How long the last look at the device lasts after the user has typed the code. It is short,
/// because the turn before it listened already.
const CODE_LAST_LOOK: Duration = Duration::from_millis(30);

/// The code as the user typed it, with the spaces that the device's screen shows removed. `None`
/// when it is not 6 digits.
pub(crate) fn normalize_code(typed: &str) -> Option<Zeroizing<String>> {
  let code: Zeroizing<String> = Zeroizing::new(
    typed
      .chars()
      .filter(|c| !c.is_whitespace())
      .collect::<String>(),
  );
  (code.len() == 6 && code.bytes().all(|byte| byte.is_ascii_digit())).then_some(code)
}

fn cancelled_in_the_app() -> Error {
  Error::new(
    ErrorKind::UserAbort,
    "You cancelled the pairing. Nothing was signed. Start again when you are ready.",
  )
}

fn to_key(bytes: &[u8]) -> Result<[u8; 32], Error> {
  bytes.try_into().map_err(|_| unexpected_message())
}

impl<X: Transport> Device<'_, X> {
  /// Waits until the user has typed the code. The device shows the code and waits, and it
  /// sends a message by itself when the user cancels on its screen, so the wait listens to the
  /// device too. It ends when the user typed the code, the user cancelled in the app, the device
  /// sent a failure or went away, or the user used up ten minutes.
  fn wait_for_code(&mut self) -> Result<String, Error> {
    let mut patience = Deadline::new(USER);
    loop {
      let entry = self.ui.pairing_code(CODE_POLL);
      let typed = match entry {
        CodeEntry::Cancelled => return Err(cancelled_in_the_app()),
        CodeEntry::Entered(code) => Some(code),
        CodeEntry::Pending => None,
      };
      // The device is read after the user's answer, so that a cancel on the device wins over a
      // code that the user typed at the same moment. The device would drop a tag that the host
      // sends while it is sending its failure.
      let look = if typed.is_some() {
        CODE_LAST_LOOK
      } else {
        CODE_POLL
      };
      if let Some(raw) = self.listen(MANAGEMENT_SESSION, look)? {
        // Nothing but a failure is allowed here. The firmware sends `ActionCancelled` when the
        // user cancels on the code screen.
        if raw.message_type != Failure::TYPE {
          return Err(unexpected_message());
        }
        let failure = Failure::decode(raw.body.as_slice()).map_err(|_| unexpected_message())?;
        return Err(failure_error(&failure, Step::Pair));
      }
      if let Some(code) = typed {
        return Ok(code);
      }
      patience.silence(look);
      if patience.expired() {
        return Err(link_error(LinkError::UserTimeout));
      }
    }
  }

  /// Pairs with the device. The channel is ready for application messages afterwards.
  pub(crate) fn pair(&mut self) -> Result<(), Error> {
    let session = MANAGEMENT_SESSION;
    // The device asks the user to allow the connection as soon as it gets the request.
    self.ui.progress(Progress::ConfirmConnection);
    let _: ThpPairingRequestApproved = self.call(
      session,
      &ThpPairingRequest {
        host_name: HOST_NAME.to_string(),
        app_name: APP_NAME.to_string(),
      },
      USER,
      Step::Pair,
      None,
    )?;

    let commitment: ThpCodeEntryCommitment = self.call(
      session,
      &ThpSelectMethod {
        selected_pairing_method: ThpPairingMethod::CodeEntry as i32,
      },
      QUICK,
      Step::Pair,
      None,
    )?;
    if commitment.commitment.len() != 32 {
      return Err(unexpected_message());
    }

    let mut challenge = [0_u8; 16];
    random_bytes(&mut challenge);
    let trezor_key: ThpCodeEntryCpaceTrezor = self.call(
      session,
      &ThpCodeEntryChallenge {
        challenge: challenge.to_vec(),
      },
      QUICK,
      Step::Pair,
      None,
    )?;
    let trezor_key = to_key(&trezor_key.cpace_trezor_public_key)?;

    self.ui.progress(Progress::EnterPairingCode);
    let typed = Zeroizing::new(self.wait_for_code()?);
    let Some(code) = normalize_code(&typed) else {
      return Err(Error::new(
        ErrorKind::PairingRejected,
        "The pairing code has 6 digits. Start again, and type the 6 digits that the Trezor Safe 7 shows.",
      ));
    };

    let mut private_key = Zeroizing::new([0_u8; 32]);
    random_bytes(&mut private_key[..]);
    let handshake_hash = *self.link.handshake_hash();
    let Some(tag) = cpace::host_tag(code.as_bytes(), &handshake_hash, &trezor_key, &private_key)
    else {
      return Err(unexpected_message());
    };
    let secret: ThpCodeEntrySecret = self.call(
      session,
      &ThpCodeEntryCpaceHostTag {
        cpace_host_public_key: tag.public_key.to_vec(),
        tag: tag.tag.to_vec(),
      },
      QUICK,
      Step::PairCode,
      None,
    )?;
    let secret = Zeroizing::new(secret.secret);

    // The device accepted the code. Now the app checks that the device knows the code too, so
    // that a device that does not show a code cannot pass. The commitment was sent first, so the
    // device could not choose the code after it saw the challenge.
    if !cpace::secret_matches(
      &commitment.commitment,
      &secret,
      code.as_bytes(),
      &handshake_hash,
      &challenge,
    ) {
      return Err(Error::new(
        ErrorKind::PairingRejected,
        "The Trezor Safe 7 did not prove that it shows the code that you typed. Do not continue. Unplug the Trezor Safe 7, plug it in again, and start again.",
      ));
    }

    let _: ThpEndResponse = self.call(session, &ThpEndRequest {}, QUICK, Step::Pair, None)?;
    self.link.end_pairing();
    Ok(())
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn a_code_is_six_digits() {
    assert_eq!(
      normalize_code("123456").as_deref().map(String::as_str),
      Some("123456")
    );
    assert_eq!(
      normalize_code(" 123 456 ").as_deref().map(String::as_str),
      Some("123456")
    );
    assert_eq!(
      normalize_code("000007").as_deref().map(String::as_str),
      Some("000007")
    );
    for bad in [
      "",
      "12345",
      "1234567",
      "12345a",
      "12 34",
      "１２３４５６",
      "123-456",
    ] {
      assert!(normalize_code(bad).is_none(), "{bad:?}");
    }
  }
}
