//! A Safe 7 with an open channel: typed calls on top of the messages of the link.

use crate::device_error::{failure_error, link_error, unexpected_message, Step};
use crate::error::Error;
use crate::link::{timeout_error, Deadline, Link, Raw};
use crate::proto::{ButtonAck, Cancel, Failure, Wire};
use crate::session::{Progress, Ui};
use crate::transport::Transport;
use prost::Message;
use std::time::Duration;

/// Messages for other sessions that one wait skips before it gives up. The device has none to
/// send unless an earlier run left some behind.
const MAX_FOREIGN_MESSAGES: u32 = 64;
/// Button requests that one call acknowledges. A transaction has a few screens for each output.
const MAX_BUTTON_REQUESTS: u32 = 512;

pub(crate) struct Device<'a, X: Transport> {
  pub(crate) link: Link<X>,
  pub(crate) ui: &'a mut dyn Ui,
  /// The session that the last call used, so that a cancel goes to the right one.
  session: u8,
  /// The progress that the last button request announced, so that the user hears it once.
  announced: Option<Progress>,
}

impl<'a, X: Transport> Device<'a, X> {
  pub(crate) fn new(link: Link<X>, ui: &'a mut dyn Ui) -> Self {
    Device {
      link,
      ui,
      session: 0,
      announced: None,
    }
  }

  /// Waits for the next message of `session`. A wait that runs out is an error.
  fn receive_for(&mut self, session: u8, patience: Duration) -> Result<Raw, Error> {
    self
      .listen(session, patience)?
      .ok_or_else(|| link_error(timeout_error(patience)))
  }

  /// Listens to the device for at most `wait`, and acknowledges what it sends. Messages of other
  /// sessions are skipped, and the whole wait has one deadline. Returns what the device sent for
  /// `session`, or `None` when it stayed quiet. The pairing uses this while it
  /// waits for the user, because the device speaks on its own when the user cancels on its screen.
  pub(crate) fn listen(&mut self, session: u8, wait: Duration) -> Result<Option<Raw>, Error> {
    let mut deadline = Deadline::new(wait);
    for _ in 0..MAX_FOREIGN_MESSAGES {
      match self.link.receive_until(&mut deadline).map_err(link_error)? {
        None => return Ok(None),
        Some(raw) if raw.session == session => return Ok(Some(raw)),
        Some(_) => {}
      }
    }
    Err(unexpected_message())
  }

  /// Sends `request` on `session` and returns the `Resp` that the device answers with. A button
  /// request on the way is acknowledged, and it makes the call wait for the user. `announce` is
  /// what the user is told when the first button request of a kind comes.
  pub(crate) fn call<Req: Wire, Resp: Wire>(
    &mut self,
    session: u8,
    request: &Req,
    patience: Duration,
    step: Step,
    announce: Option<Progress>,
  ) -> Result<Resp, Error> {
    self.session = session;
    self.link.send(session, request).map_err(link_error)?;
    let mut patience = patience;
    for _ in 0..MAX_BUTTON_REQUESTS {
      let raw = self.receive_for(session, patience)?;
      if raw.message_type == Resp::TYPE {
        return Resp::decode(raw.body.as_slice()).map_err(|_| unexpected_message());
      }
      match raw.message_type {
        Failure::TYPE => {
          let failure = Failure::decode(raw.body.as_slice()).map_err(|_| unexpected_message())?;
          return Err(failure_error(&failure, step));
        }
        crate::proto::ButtonRequest::TYPE => {
          // The user decides on the device, and the device is not in a hurry.
          patience = crate::link::USER;
          if let Some(progress) = announce {
            if self.announced != Some(progress) {
              self.announced = Some(progress);
              self.ui.progress(progress);
            }
          }
          self.link.send(session, &ButtonAck {}).map_err(link_error)?;
        }
        _ => return Err(unexpected_message()),
      }
    }
    Err(unexpected_message())
  }

  /// Tells the device to drop what it waits for, so that its screen goes back to the home
  /// screen. This is best effort: the session is over either way.
  pub(crate) fn abandon(&mut self) {
    let _ = self.link.send_once(self.session, &Cancel {});
  }
}
