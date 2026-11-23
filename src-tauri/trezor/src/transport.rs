//! The packet pipe between the app and the device.

use std::time::Duration;

/// The size of one packet on USB, and on the emulator's UDP port.
pub const PACKET_LEN: usize = 64;

/// Why a packet could not be sent or read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransportError {
  /// The device went away: it was unplugged, or its end of the pipe closed.
  Disconnected,
  /// Any other failure of the pipe.
  Failed,
}

/// One end of a pipe that carries whole packets, in order. USB and UDP both do this.
///
/// The calls block. The session runs on one thread that may block.
pub trait Transport {
  /// Sends one packet.
  fn write_packet(&mut self, packet: &[u8]) -> Result<(), TransportError>;

  /// Waits up to `timeout` for one packet. `Ok(None)` means that no packet came in time.
  fn read_packet(&mut self, timeout: Duration) -> Result<Option<Vec<u8>>, TransportError>;
}

impl<T: Transport + ?Sized> Transport for &mut T {
  fn write_packet(&mut self, packet: &[u8]) -> Result<(), TransportError> {
    (**self).write_packet(packet)
  }

  fn read_packet(&mut self, timeout: Duration) -> Result<Option<Vec<u8>>, TransportError> {
    (**self).read_packet(timeout)
  }
}
