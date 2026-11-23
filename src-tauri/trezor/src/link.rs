//! The host side of the Trezor Host Protocol (THP) over a [`Transport`].
//!
//! `trezor-thp` does the framing, the Noise handshake, the encryption and the alternating-bit
//! bookkeeping, and it does no I/O. This file is the loop that the crate expects the host to run:
//! it moves packets between the transport and the channel, answers every message with an ACK,
//! and sends a message again when its ACK is late.
//!
//! Waiting is counted in the time that the transport waited with no packet, not in wall-clock
//! time. A real transport blocks for the time it was given, so the two agree. A packet that
//! arrives but does not belong to the channel costs no time, so there is a separate limit on how
//! many of those one wait accepts.

use crate::proto::{ThpDeviceProperties, Wire};
use crate::transport::{Transport, TransportError};
use prost::Message;
use std::time::Duration;
use trezor_noise_rust_crypto::{Aes256Gcm, Sha256, X25519};
use trezor_thp::channel::buffered::Buffered;
use trezor_thp::channel::host::{Channel, ChannelOpen, Mux};
use trezor_thp::channel::{retransmit_after_ms, PacketInResult, PairingState, Phase};
use trezor_thp::credential::NullCredentialStore;
use trezor_thp::error::TransportError as ThpTransportError;
use trezor_thp::{Backend, ChannelIO};

/// How long a wait for an answer that the device gives by itself may take.
pub(crate) const QUICK: Duration = Duration::from_secs(15);
/// How long a wait for an answer that needs the user may take. The user may have to find the
/// device, read a screen and type a PIN, a code or a passphrase.
pub(crate) const USER: Duration = Duration::from_secs(10 * 60);

/// The longest the transport blocks in one read. A short read keeps the loop responsive.
const SLICE: Duration = Duration::from_secs(1);
/// Times that one message is sent again, without an ACK, before the link gives up. The waits
/// between the tries grow from 0.2 to 3.5 seconds, so this is about thirteen seconds.
const MAX_RETRANSMISSIONS: u8 = 15;
/// Packets that one wait ignores before it gives up. A device that is quiet has a few stale
/// packets at most.
const MAX_IGNORED_PACKETS: u32 = 5_000;
/// Times that the channel allocation request is sent, and the wait after each one.
const ALLOCATION_ATTEMPTS: u32 = 5;
const ALLOCATION_WAIT: Duration = Duration::from_secs(2);
/// Stale packets that the start of a session discards, and how long it waits for one more.
const MAX_STALE_PACKETS: u32 = 512;
const STALE_WAIT: Duration = Duration::from_millis(30);
/// The firmware's major version of THP that this code speaks.
pub(crate) const PROTOCOL_MAJOR: u32 = 2;

/// The cryptography of the channel: X25519, AES-256-GCM and SHA-256.
pub(crate) struct Crypto;

impl Backend for Crypto {
  type Cipher = Aes256Gcm;
  type DH = X25519;
  type Hash = Sha256;

  fn random_bytes(dest: &mut [u8]) {
    // A key from a failed random source would be a key that anyone can guess. `check_random`
    // runs before the first key is made, so a panic here means that the source broke later.
    if getrandom::fill(dest).is_err() {
      panic!("the operating system gives no random bytes");
    }
  }
}

/// Checks that the operating system gives random bytes, so that the channel keys are sound.
pub(crate) fn check_random() -> bool {
  let mut probe = [0_u8; 8];
  getrandom::fill(&mut probe).is_ok()
}

/// Fills `dest` with random bytes. Call [`check_random`] first.
pub(crate) fn random_bytes(dest: &mut [u8]) {
  Crypto::random_bytes(dest);
}

/// Why the link failed. The session turns this into an error for the user.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum LinkError {
  Transport(TransportError),
  /// The device did not answer in time.
  Timeout,
  /// The device is locked, and the handshake did not ask it to show the PIN screen.
  DeviceLocked,
  /// The device dropped the channel or could not decrypt a message, or the channel broke.
  ChannelLost,
  /// The device sent something that this protocol does not allow.
  Protocol,
}

impl From<TransportError> for LinkError {
  fn from(error: TransportError) -> Self {
    LinkError::Transport(error)
  }
}

/// One message of the application layer, as it came off the channel.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Raw {
  pub session: u8,
  pub message_type: u16,
  pub body: Vec<u8>,
}

enum Event {
  Ack,
  Message,
  Nothing,
}

fn classify(result: PacketInResult) -> Result<Event, LinkError> {
  match result {
    PacketInResult::Accepted {
      ack_received,
      message_ready,
      ..
    } => Ok(if message_ready {
      Event::Message
    } else if ack_received {
      Event::Ack
    } else {
      Event::Nothing
    }),
    PacketInResult::TransportError { error } => match error {
      // The device is reading a message on another channel. The retransmission timer tries again.
      ThpTransportError::TransportBusy => Ok(Event::Nothing),
      ThpTransportError::DeviceLocked => Err(LinkError::DeviceLocked),
      ThpTransportError::UnallocatedChannel | ThpTransportError::DecryptionFailed => {
        Err(LinkError::ChannelLost)
      }
    },
    PacketInResult::Failed { .. } => Err(LinkError::ChannelLost),
    // A packet for another channel, a damaged packet and a stale allocation answer all end here.
    _ => Ok(Event::Nothing),
  }
}

fn flush<T: Transport, C: ChannelIO>(
  transport: &mut T,
  channel: &mut Buffered<C>,
) -> Result<(), LinkError> {
  // One message is a few packets. The limit stops a channel that never runs dry.
  for _ in 0..4096 {
    if !channel.packet_out_ready() {
      return Ok(());
    }
    let packet = channel.packet_out().map_err(|_| LinkError::Protocol)?;
    transport.write_packet(&packet)?;
  }
  Err(LinkError::Protocol)
}

/// Discards the packets that an earlier session left in the device's queue. A device that was
/// cut off in the middle of an answer sends the rest of it to the next reader. Those packets
/// belong to channels that no longer exist, and the channel code ignores them, but reading them
/// first keeps them out of the first handshake.
pub(crate) fn discard_stale_packets<T: Transport>(transport: &mut T) -> Result<(), LinkError> {
  for _ in 0..MAX_STALE_PACKETS {
    if transport.read_packet(STALE_WAIT)?.is_none() {
      return Ok(());
    }
  }
  Ok(())
}

/// A failure that gives the transport back, so that the caller can try again on it.
pub(crate) struct Failed<T> {
  pub(crate) error: LinkError,
  pub(crate) transport: T,
}

impl<T> std::fmt::Debug for Failed<T> {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    write!(f, "Failed({:?})", self.error)
  }
}

/// A channel that the device allocated, before the handshake.
pub(crate) struct Allocated<T: Transport> {
  transport: T,
  channel: Buffered<ChannelOpen<NullCredentialStore, Crypto>>,
  pub(crate) properties: ThpDeviceProperties,
}

fn allocate_channel<T: Transport>(
  transport: &mut T,
  try_to_unlock: bool,
) -> Result<
  (
    Buffered<ChannelOpen<NullCredentialStore, Crypto>>,
    ThpDeviceProperties,
  ),
  LinkError,
> {
  let mut mux = Buffered::new(Mux::<Crypto>::new());
  for _ in 0..ALLOCATION_ATTEMPTS {
    mux.request_channel(try_to_unlock);
    flush(transport, &mut mux)?;
    let mut waited = Duration::ZERO;
    let mut ignored = 0;
    while waited < ALLOCATION_WAIT {
      let slice = SLICE.min(ALLOCATION_WAIT - waited);
      match transport.read_packet(slice)? {
        None => waited += slice,
        Some(packet) => {
          ignored += 1;
          if ignored > MAX_IGNORED_PACKETS {
            return Err(LinkError::Protocol);
          }
          if mux.packet_in(&packet).got_channel() {
            let open = mux
              .map(|mux| mux.complete(NullCredentialStore))
              .map_err(|_| LinkError::Protocol)?;
            let properties = ThpDeviceProperties::decode(open.device_properties())
              .map_err(|_| LinkError::Protocol)?;
            return Ok((open, properties));
          }
        }
      }
    }
  }
  Err(LinkError::Timeout)
}

impl<T: Transport> Allocated<T> {
  /// Asks the device for a channel. `try_to_unlock` asks a locked device to show its PIN screen
  /// when the handshake starts. Without it, a locked device answers the handshake with an error.
  pub(crate) fn allocate(mut transport: T, try_to_unlock: bool) -> Result<Self, Failed<T>> {
    match allocate_channel(&mut transport, try_to_unlock) {
      Ok((channel, properties)) => Ok(Allocated {
        transport,
        channel,
        properties,
      }),
      Err(error) => Err(Failed { error, transport }),
    }
  }

  fn run_handshake(&mut self, patience: Duration) -> Result<(), LinkError> {
    let mut waited = Duration::ZERO;
    let mut retries = 0_u8;
    let mut ignored = 0_u32;
    loop {
      flush(&mut self.transport, &mut self.channel)?;
      if self.channel.handshake_done() {
        return Ok(());
      }
      if self.channel.handshake_failed() {
        return Err(LinkError::ChannelLost);
      }
      let sending = self.channel.sending_retry();
      let slice = match sending {
        Some(retry) => Duration::from_millis(retransmit_after_ms(retry).into()),
        None => SLICE.min(
          patience
            .saturating_sub(waited)
            .max(Duration::from_millis(1)),
        ),
      };
      match self.transport.read_packet(slice)? {
        None => match sending {
          Some(_) => {
            retries += 1;
            if retries > MAX_RETRANSMISSIONS {
              return Err(LinkError::Timeout);
            }
            self
              .channel
              .message_retransmit()
              .map_err(|_| LinkError::Protocol)?;
          }
          None => {
            waited += slice;
            if waited >= patience {
              return Err(LinkError::Timeout);
            }
          }
        },
        Some(packet) => {
          ignored += 1;
          if ignored > MAX_IGNORED_PACKETS {
            return Err(LinkError::Protocol);
          }
          classify(self.channel.packet_in(&packet))?;
        }
      }
    }
  }

  /// Runs the Noise handshake. `patience` is how long the device may take to answer the first
  /// message. A device that shows its PIN screen answers when the user has typed the PIN.
  pub(crate) fn handshake(
    mut self,
    patience: Duration,
  ) -> Result<(Link<T>, PairingState), Failed<T>> {
    if let Err(error) = self.run_handshake(patience) {
      return Err(Failed {
        error,
        transport: self.transport,
      });
    }
    let Allocated {
      transport, channel, ..
    } = self;
    let channel = match channel.map(|open| open.complete()) {
      Ok(channel) => channel,
      Err(_) => {
        return Err(Failed {
          error: LinkError::Protocol,
          transport,
        })
      }
    };
    let pairing_state = match channel.phase() {
      Phase::PairingCredential {
        handshake_pairing_state,
      } => handshake_pairing_state,
      Phase::EncryptedTransport => {
        return Err(Failed {
          error: LinkError::Protocol,
          transport,
        })
      }
    };
    let mut handshake_hash = [0_u8; 32];
    handshake_hash.copy_from_slice(channel.handshake_hash());
    Ok((
      Link {
        transport,
        channel,
        handshake_hash,
      },
      pairing_state,
    ))
  }
}

/// An open channel. Messages go in and out with their session number.
pub(crate) struct Link<T: Transport> {
  transport: T,
  channel: Buffered<Channel<Crypto>>,
  handshake_hash: [u8; 32],
}

impl<T: Transport> Link<T> {
  /// The hash of the handshake. Both sides know it, and the pairing code is bound to it.
  pub(crate) fn handshake_hash(&self) -> &[u8; 32] {
    &self.handshake_hash
  }

  /// Marks the end of the pairing and credential phase.
  pub(crate) fn end_pairing(&mut self) {
    self.channel.end_pairing();
  }

  /// Sends one message and waits until the device has acknowledged it.
  pub(crate) fn send<M: Wire>(&mut self, session: u8, message: &M) -> Result<(), LinkError> {
    self.send_with(session, message, MAX_RETRANSMISSIONS)
  }

  /// Sends a message that the app does not need an answer to, such as a cancel before it gives
  /// up. A device that does not answer costs two short waits and not the full thirteen seconds.
  pub(crate) fn send_once<M: Wire>(&mut self, session: u8, message: &M) -> Result<(), LinkError> {
    self.send_with(session, message, 2)
  }

  fn send_with<M: Wire>(
    &mut self,
    session: u8,
    message: &M,
    max_retransmissions: u8,
  ) -> Result<(), LinkError> {
    self
      .channel
      .message_in(session, M::TYPE, &message.encode_to_vec())
      .map_err(|_| LinkError::Protocol)?;
    let mut retries = 0_u8;
    let mut ignored = 0_u32;
    loop {
      flush(&mut self.transport, &mut self.channel)?;
      if self.channel.message_in_ready() {
        return Ok(());
      }
      let retry = self.channel.sending_retry().unwrap_or(retries);
      let slice = Duration::from_millis(retransmit_after_ms(retry).into());
      match self.transport.read_packet(slice)? {
        None => {
          retries += 1;
          if retries > max_retransmissions {
            return Err(LinkError::Timeout);
          }
          self
            .channel
            .message_retransmit()
            .map_err(|_| LinkError::Protocol)?;
        }
        Some(packet) => {
          ignored += 1;
          if ignored > MAX_IGNORED_PACKETS {
            return Err(LinkError::Protocol);
          }
          classify(self.channel.packet_in(&packet))?;
        }
      }
    }
  }

  /// Waits for one message, and acknowledges it. `patience` is how long the device may stay quiet.
  pub(crate) fn receive(&mut self, patience: Duration) -> Result<Raw, LinkError> {
    let mut waited = Duration::ZERO;
    let mut ignored = 0_u32;
    loop {
      flush(&mut self.transport, &mut self.channel)?;
      let slice = SLICE.min(
        patience
          .saturating_sub(waited)
          .max(Duration::from_millis(1)),
      );
      match self.transport.read_packet(slice)? {
        None => {
          waited += slice;
          if waited >= patience {
            return Err(LinkError::Timeout);
          }
        }
        Some(packet) => {
          ignored += 1;
          if ignored > MAX_IGNORED_PACKETS {
            return Err(LinkError::Protocol);
          }
          if let Event::Message = classify(self.channel.packet_in(&packet))? {
            let (session, message_type, body) = self
              .channel
              .message_out()
              .map_err(|_| LinkError::ChannelLost)?;
            flush(&mut self.transport, &mut self.channel)?;
            return Ok(Raw {
              session,
              message_type,
              body,
            });
          }
        }
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::test_device::{Behavior, SoftDevice};

  #[test]
  fn the_handshake_of_a_fresh_device_asks_for_pairing() {
    let mut device = SoftDevice::new(Behavior::default());
    let allocated = Allocated::allocate(&mut device, false).expect("a channel");
    assert_eq!(allocated.properties.internal_model, "T3W1");
    let (link, state) = allocated.handshake(QUICK).expect("a handshake");
    assert_eq!(state, PairingState::Unpaired);
    assert_ne!(link.handshake_hash(), &[0_u8; 32]);
  }

  #[test]
  fn a_locked_device_answers_the_handshake_with_an_error() {
    let mut device = SoftDevice::new(Behavior {
      locked: true,
      ..Behavior::default()
    });
    let allocated = Allocated::allocate(&mut device, false).expect("a channel");
    let error = allocated.handshake(QUICK).err().expect("an error");
    assert_eq!(error.error, LinkError::DeviceLocked);
  }

  #[test]
  fn a_locked_device_that_is_asked_to_unlock_finishes_the_handshake() {
    let mut device = SoftDevice::new(Behavior {
      locked: true,
      ..Behavior::default()
    });
    let allocated = Allocated::allocate(&mut device, true).expect("a channel");
    assert!(allocated.handshake(QUICK).is_ok());
  }

  #[test]
  fn stale_packets_in_the_queue_do_not_disturb_the_handshake() {
    let mut device = SoftDevice::new(Behavior::default());
    device.queue_stale_packets();
    discard_stale_packets(&mut device).expect("the stale packets are read");
    let allocated = Allocated::allocate(&mut device, false).expect("a channel");
    assert!(allocated.handshake(QUICK).is_ok());
  }

  #[test]
  fn stale_packets_that_arrive_after_the_discard_are_ignored() {
    let mut device = SoftDevice::new(Behavior::default());
    device.queue_stale_packets();
    // No discard: the stale packets are in front of the first answer.
    let allocated = Allocated::allocate(&mut device, false).expect("a channel");
    assert!(allocated.handshake(QUICK).is_ok());
  }

  #[test]
  fn a_device_that_never_answers_ends_the_allocation_with_a_timeout() {
    let mut device = SoftDevice::new(Behavior {
      silent: true,
      ..Behavior::default()
    });
    let error = Allocated::allocate(&mut device, false)
      .err()
      .expect("an error");
    assert_eq!(error.error, LinkError::Timeout);
  }

  #[test]
  fn a_device_that_never_stops_sending_ends_the_allocation() {
    let mut device = SoftDevice::new(Behavior {
      babble: true,
      ..Behavior::default()
    });
    let error = Allocated::allocate(&mut device, false)
      .err()
      .expect("an error");
    assert_eq!(error.error, LinkError::Protocol);
  }

  #[test]
  fn a_lost_packet_is_sent_again() {
    let mut device = SoftDevice::new(Behavior {
      drop_host_packets: vec![3],
      ..Behavior::default()
    });
    let allocated = Allocated::allocate(&mut device, false).expect("a channel");
    assert!(allocated.handshake(QUICK).is_ok());
  }
}
