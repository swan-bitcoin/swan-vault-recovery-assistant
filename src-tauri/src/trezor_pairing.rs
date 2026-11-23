// Hands the pairing code from the window to the thread that talks to the Trezor Safe 7.
//
// The session thread blocks while the user reads the code on the Trezor and types it into SVRA.
// The window answers with a separate command, so the two sides need a place to meet. This module
// is that place. It has no Tauri types, so unit tests cover it.
//
// Rules that the tests pin down:
// - At most one wait is open. A new wait cancels an older one that is still open.
// - A code reaches the wait once. After that, the slot is empty and a second code is refused.
// - A wait removes its own entry when it ends, for any reason, so a code that a later session
//   receives was always meant for that later session.

use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Mutex, MutexGuard, PoisonError};

/// No session waits for a code.
#[derive(Debug, PartialEq, Eq)]
pub struct NotWaiting;

struct Waiting {
  id: u64,
  // The window that started the session. Closing this window cancels the wait.
  owner: String,
  sender: Sender<String>,
}

struct Slot {
  next_id: u64,
  waiting: Option<Waiting>,
}

pub struct PairingCodes {
  slot: Mutex<Slot>,
}

impl PairingCodes {
  pub const fn new() -> Self {
    PairingCodes {
      slot: Mutex::new(Slot {
        next_id: 0,
        waiting: None,
      }),
    }
  }

  // The slot holds plain data that every method leaves in a valid state, so a panic on another
  // thread must not block the next session.
  fn slot(&self) -> MutexGuard<'_, Slot> {
    self.slot.lock().unwrap_or_else(PoisonError::into_inner)
  }

  /// Opens the wait for `owner`. The window may send its code from this call on. A wait that is
  /// still open is cancelled.
  pub fn begin(&self, owner: &str) -> Wait<'_> {
    let (sender, receiver) = mpsc::channel();
    let mut slot = self.slot();
    let id = slot.next_id;
    slot.next_id += 1;
    slot.waiting = Some(Waiting {
      id,
      owner: owner.to_string(),
      sender,
    });
    Wait {
      codes: self,
      id,
      receiver,
    }
  }

  /// Gives the code to the open wait. A second code for the same wait is refused.
  pub fn submit(&self, code: String) -> Result<(), NotWaiting> {
    let waiting = self.slot().waiting.take().ok_or(NotWaiting)?;
    // The send fails when the session ended in the meantime. Then nobody receives the code, and
    // dropping it here is right.
    waiting.sender.send(code).map_err(|_| NotWaiting)
  }

  /// Ends the open wait without a code.
  pub fn cancel(&self) -> Result<(), NotWaiting> {
    // Dropping the sender wakes the session thread.
    self.slot().waiting.take().map(drop).ok_or(NotWaiting)
  }

  /// Ends the open wait when `owner` started it. The app calls this when a window closes.
  pub fn cancel_owned_by(&self, owner: &str) {
    let mut slot = self.slot();
    if slot
      .waiting
      .as_ref()
      .is_some_and(|waiting| waiting.owner == owner)
    {
      slot.waiting = None;
    }
  }
}

/// The session side of one wait. Dropping it closes the wait.
pub struct Wait<'a> {
  codes: &'a PairingCodes,
  id: u64,
  receiver: Receiver<String>,
}

impl Wait<'_> {
  /// Blocks until the window sends a code. Returns `None` when the wait was cancelled.
  pub fn recv(&self) -> Option<String> {
    self.receiver.recv().ok()
  }
}

impl Drop for Wait<'_> {
  fn drop(&mut self) {
    // A newer wait may already own the slot. Leave that one alone.
    let mut slot = self.codes.slot();
    if slot
      .waiting
      .as_ref()
      .is_some_and(|waiting| waiting.id == self.id)
    {
      slot.waiting = None;
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::thread;
  use std::time::Duration;

  #[test]
  fn a_code_reaches_the_open_wait() {
    let codes = PairingCodes::new();
    let wait = codes.begin("main");
    assert_eq!(codes.submit("123456".to_string()), Ok(()));
    assert_eq!(wait.recv(), Some("123456".to_string()));
  }

  #[test]
  fn a_code_that_arrives_while_the_session_blocks_wakes_it() {
    let codes = PairingCodes::new();
    thread::scope(|scope| {
      let wait = codes.begin("main");
      let session = scope.spawn(move || wait.recv());
      thread::sleep(Duration::from_millis(20));
      assert_eq!(codes.submit("654321".to_string()), Ok(()));
      assert_eq!(session.join().unwrap(), Some("654321".to_string()));
    });
  }

  #[test]
  fn both_commands_refuse_when_no_session_waits() {
    let codes = PairingCodes::new();
    assert_eq!(codes.submit("123456".to_string()), Err(NotWaiting));
    assert_eq!(codes.cancel(), Err(NotWaiting));
  }

  #[test]
  fn a_second_code_for_the_same_wait_is_refused() {
    let codes = PairingCodes::new();
    let wait = codes.begin("main");
    assert_eq!(codes.submit("111111".to_string()), Ok(()));
    assert_eq!(codes.submit("222222".to_string()), Err(NotWaiting));
    assert_eq!(codes.cancel(), Err(NotWaiting));
    assert_eq!(wait.recv(), Some("111111".to_string()));
  }

  #[test]
  fn cancel_wakes_the_wait_with_none() {
    let codes = PairingCodes::new();
    let wait = codes.begin("main");
    assert_eq!(codes.cancel(), Ok(()));
    assert_eq!(wait.recv(), None);
    // The cancel used the wait up.
    assert_eq!(codes.submit("123456".to_string()), Err(NotWaiting));
  }

  #[test]
  fn a_wait_that_ended_leaves_no_sender_behind() {
    let codes = PairingCodes::new();
    drop(codes.begin("main"));
    assert_eq!(codes.submit("123456".to_string()), Err(NotWaiting));
    assert_eq!(codes.cancel(), Err(NotWaiting));
  }

  #[test]
  fn a_panic_of_the_session_thread_leaves_no_sender_behind() {
    let codes = PairingCodes::new();
    let result = thread::scope(|scope| {
      scope
        .spawn(|| {
          let _wait = codes.begin("main");
          panic!("the session failed");
        })
        .join()
    });
    assert!(result.is_err());
    assert_eq!(codes.submit("123456".to_string()), Err(NotWaiting));
  }

  #[test]
  fn a_late_code_is_not_kept_for_the_next_session() {
    let codes = PairingCodes::new();
    drop(codes.begin("main"));
    // The first session is over. Its code arrives now and is refused, not queued.
    assert_eq!(codes.submit("123456".to_string()), Err(NotWaiting));
    let next = codes.begin("main");
    assert_eq!(codes.cancel(), Ok(()));
    assert_eq!(next.recv(), None);
  }

  #[test]
  fn an_old_wait_that_ends_late_does_not_close_the_newer_one() {
    let codes = PairingCodes::new();
    let old = codes.begin("main");
    let newer = codes.begin("main");
    // The newer wait cancelled the old one.
    assert_eq!(old.recv(), None);
    drop(old);
    assert_eq!(codes.submit("123456".to_string()), Ok(()));
    assert_eq!(newer.recv(), Some("123456".to_string()));
  }

  #[test]
  fn closing_the_window_that_owns_the_wait_cancels_it() {
    let codes = PairingCodes::new();
    let wait = codes.begin("main");
    codes.cancel_owned_by("main");
    assert_eq!(wait.recv(), None);
    assert_eq!(codes.submit("123456".to_string()), Err(NotWaiting));
  }

  #[test]
  fn closing_another_window_leaves_the_wait_open() {
    let codes = PairingCodes::new();
    let wait = codes.begin("main");
    codes.cancel_owned_by("help");
    assert_eq!(codes.submit("123456".to_string()), Ok(()));
    assert_eq!(wait.recv(), Some("123456".to_string()));
  }

  #[test]
  fn a_blocked_session_ends_when_its_window_closes() {
    let codes = PairingCodes::new();
    thread::scope(|scope| {
      let wait = codes.begin("main");
      let session = scope.spawn(move || wait.recv());
      thread::sleep(Duration::from_millis(20));
      codes.cancel_owned_by("main");
      assert_eq!(session.join().unwrap(), None);
    });
  }
}
