//! The session against Trezor's firmware emulator (a Safe 7, firmware 2.13.1).
//!
//! Each test starts its own model server (the secure element of the Safe 7) and its own
//! emulator, on free ports and with a new profile directory, and drives the screens of the
//! device through the debug link. The tests skip when `TREZOR_EMULATOR` is not set, unless
//! `TREZOR_EMULATOR_REQUIRED` is set: then a missing emulator fails the test. CI sets it. With
//! `TREZOR_EMULATOR` set, `TREZOR_TROPIC_MODEL_SERVER` and `TREZOR_TROPIC_MODEL_CONFIG` must be
//! set too.
//!
//! The debug link is the unencrypted protocol v1 over UDP, on the port after the wire port. The
//! harness reads the pairing code from it and presses "confirm" on the screens that the session
//! shows. It never presses on the code screen, because the button of that screen cancels.

use crate::device::Device;
use crate::device_error::Step;
use crate::link::USER;
use crate::proto::{Success, Wire};
use crate::session::{connect, sign_psbt, CodeEntry, Progress, SignOutcome, SignRequest, Ui};
use crate::test_support::{sign_with, Vault};
use crate::transport::{Transport, TransportError};
use crate::{Error, ErrorKind};
use bdk_wallet::KeychainKind;
use bitcoin::absolute::LockTime;
use bitcoin::bip32::Xpriv;
use bitcoin::psbt::Psbt;
use bitcoin::{Network, NetworkKind};
use bitcoin::{OutPoint, Transaction, TxOut, Witness};
use prost::Message;
use sha2::Sha512;
use std::io::ErrorKind as IoErrorKind;
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

// ---------------------------------------------------------------------------------------------
// The messages that only the tests use.

#[derive(Clone, PartialEq, Message)]
struct LoadDevice {
  #[prost(string, repeated, tag = "1")]
  mnemonics: Vec<String>,
  #[prost(string, optional, tag = "3")]
  pin: Option<String>,
  #[prost(bool, optional, tag = "4")]
  passphrase_protection: Option<bool>,
  #[prost(string, optional, tag = "6")]
  label: Option<String>,
}

#[derive(Clone, PartialEq, Message)]
struct LockDevice {}

#[derive(Clone, PartialEq, Message)]
struct ApplySettings {
  #[prost(bool, optional, tag = "8")]
  passphrase_always_on_device: Option<bool>,
}

#[derive(Clone, PartialEq, Message)]
struct DebugLinkDecision {
  /// 0 is no, 1 is yes.
  #[prost(uint32, optional, tag = "1")]
  button: Option<u32>,
  #[prost(string, optional, tag = "3")]
  input: Option<String>,
}

#[derive(Clone, PartialEq, Message)]
struct DebugLinkGetState {
  /// 0: answer at once.
  #[prost(uint32, optional, tag = "3")]
  wait_layout: Option<u32>,
  #[prost(bool, optional, tag = "4")]
  return_empty_state: Option<bool>,
}

#[derive(Clone, PartialEq, Message)]
struct DebugLinkState {
  #[prost(string, repeated, tag = "13")]
  tokens: Vec<String>,
}

#[derive(Clone, PartialEq, Message)]
struct DebugLinkGetPairingInfo {
  #[prost(bytes = "vec", optional, tag = "1")]
  channel_id: Option<Vec<u8>>,
}

#[derive(Clone, PartialEq, Message)]
struct DebugLinkPairingInfo {
  #[prost(uint32, optional, tag = "3")]
  code_entry_code: Option<u32>,
}

impl Wire for LoadDevice {
  const TYPE: u16 = 13;
}
impl Wire for LockDevice {
  const TYPE: u16 = 24;
}
impl Wire for ApplySettings {
  const TYPE: u16 = 25;
}
impl Wire for DebugLinkDecision {
  const TYPE: u16 = 100;
}
impl Wire for DebugLinkGetState {
  const TYPE: u16 = 101;
}
impl Wire for DebugLinkState {
  const TYPE: u16 = 102;
}
impl Wire for DebugLinkGetPairingInfo {
  const TYPE: u16 = 9011;
}
impl Wire for DebugLinkPairingInfo {
  const TYPE: u16 = 9012;
}

// ---------------------------------------------------------------------------------------------
// The processes.

/// The emulator and the model server, and the directory that holds their files. The processes
/// stop and the directory goes when this value drops.
struct Rig {
  emulator: Child,
  model: Child,
  profile: PathBuf,
  udp_port: u16,
}

/// Ports are chosen while this lock is held and used before it is released, so that two tests do
/// not choose the same port.
static START: Mutex<()> = Mutex::new(());
static COUNTER: AtomicU32 = AtomicU32::new(0);

fn variable(name: &str) -> String {
  std::env::var(name).unwrap_or_else(|_| panic!("{name} is not set. The emulator tests need it."))
}

fn free_tcp_port() -> u16 {
  TcpListener::bind("127.0.0.1:0")
    .and_then(|listener| listener.local_addr())
    .expect("a free TCP port")
    .port()
}

/// A UDP port whose neighbours are free too: the emulator uses the port, the one after it for
/// the debug link, and a few more.
fn free_udp_block() -> u16 {
  for _ in 0..200 {
    let port = UdpSocket::bind("127.0.0.1:0")
      .and_then(|socket| socket.local_addr())
      .expect("a free UDP port")
      .port();
    if port > 60_000 {
      continue;
    }
    let held: Vec<UdpSocket> = (port..port + 6)
      .filter_map(|p| UdpSocket::bind(("127.0.0.1", p)).ok())
      .collect();
    if held.len() == 6 {
      return port;
    }
  }
  panic!("no free block of UDP ports");
}

fn log_file(profile: &Path, name: &str) -> Stdio {
  Stdio::from(std::fs::File::create(profile.join(name)).expect("a log file"))
}

fn wait_for_tcp(port: u16, child: &mut Child) {
  let deadline = Instant::now() + Duration::from_secs(30);
  while Instant::now() < deadline {
    if TcpStream::connect(("127.0.0.1", port)).is_ok() {
      return;
    }
    assert!(
      child.try_wait().expect("a child").is_none(),
      "the model server stopped"
    );
    std::thread::sleep(Duration::from_millis(50));
  }
  panic!("the model server did not start");
}

/// True when the emulator answers a ping on its wire port.
fn wait_for_emulator(port: u16, child: &mut Child) -> bool {
  let socket = UdpSocket::bind("127.0.0.1:0").expect("a UDP socket");
  socket.connect(("127.0.0.1", port)).expect("a UDP peer");
  socket
    .set_read_timeout(Some(Duration::from_millis(300)))
    .expect("a timeout");
  let deadline = Instant::now() + Duration::from_secs(30);
  while Instant::now() < deadline {
    if child.try_wait().expect("a child").is_some() {
      return false;
    }
    let _ = socket.send(b"PINGPING");
    let mut answer = [0_u8; 8];
    if socket
      .recv(&mut answer)
      .is_ok_and(|len| &answer[..len] == b"PONGPONG")
    {
      return true;
    }
    std::thread::sleep(Duration::from_millis(50));
  }
  false
}

impl Rig {
  fn start() -> Rig {
    let emulator = variable("TREZOR_EMULATOR");
    let model_server = variable("TREZOR_TROPIC_MODEL_SERVER");
    let model_config = variable("TREZOR_TROPIC_MODEL_CONFIG");

    let _start = START
      .lock()
      .unwrap_or_else(|poisoned| poisoned.into_inner());
    let profile = std::env::temp_dir().join(format!(
      "svra-trezor-emulator-{}-{}",
      std::process::id(),
      COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&profile).expect("a profile directory");

    let tropic_port = free_tcp_port();
    let mut model = Command::new(&model_server)
      .args([
        "tcp",
        "-c",
        &model_config,
        "-p",
        &tropic_port.to_string(),
        "-o",
      ])
      .arg(profile.join("tropic_model_config_output.yml"))
      .current_dir(&profile)
      .stdout(log_file(&profile, "tropic-model.log"))
      .stderr(log_file(&profile, "tropic-model.err"))
      .spawn()
      .expect("the model server starts");
    wait_for_tcp(tropic_port, &mut model);
    // The model accepts connections a moment before it can serve the emulator.
    std::thread::sleep(Duration::from_millis(500));

    let udp_port = free_udp_block();
    // The emulator dies at once when the model is not ready yet, so one more try is allowed.
    for attempt in 0..2 {
      let mut child = Command::new(&emulator)
        .args(["-O0", "-X", "heapsize=20M", "-m", "main"])
        .env("SDL_VIDEODRIVER", "dummy")
        .env("TREZOR_PROFILE_DIR", &profile)
        .env("TREZOR_PROFILE", &profile)
        .env("TREZOR_UDP_PORT", udp_port.to_string())
        .env("TROPIC_MODEL_PORT", tropic_port.to_string())
        .env("TREZOR_DISABLE_FADE", "1")
        .env("TREZOR_DISABLE_ANIMATION", "1")
        .env("TREZOR_FLASH_FILENAME", "trezor.flash")
        .env("TREZOR_SDCARD_FILENAME", "trezor.sdcard")
        .current_dir(&profile)
        .stdout(log_file(&profile, "emulator.log"))
        .stderr(log_file(&profile, "emulator.err"))
        .spawn()
        .expect("the emulator starts");
      if wait_for_emulator(udp_port, &mut child) {
        return Rig {
          emulator: child,
          model,
          profile,
          udp_port,
        };
      }
      let _ = child.kill();
      let _ = child.wait();
      assert!(
        attempt == 0,
        "the emulator did not start. See the logs in {}",
        profile.display()
      );
      std::thread::sleep(Duration::from_secs(2));
    }
    unreachable!("the loop returns or panics");
  }
}

impl Drop for Rig {
  fn drop(&mut self) {
    let _ = self.emulator.kill();
    let _ = self.emulator.wait();
    let _ = self.model.kill();
    let _ = self.model.wait();
    let _ = std::fs::remove_dir_all(&self.profile);
  }
}

// ---------------------------------------------------------------------------------------------
// The wire: THP over UDP.

/// The packets of the emulator's wire port. It also notes the number of the channel that the
/// emulator allocates, because the debug link asks for the pairing code by channel.
struct UdpTransport {
  socket: UdpSocket,
  channel: Arc<AtomicU32>,
}

impl Transport for UdpTransport {
  fn write_packet(&mut self, packet: &[u8]) -> Result<(), TransportError> {
    self
      .socket
      .send(packet)
      .map_err(|_| TransportError::Failed)?;
    // The emulator drops datagrams that come in a burst.
    std::thread::sleep(Duration::from_millis(1));
    Ok(())
  }

  fn read_packet(&mut self, timeout: Duration) -> Result<Option<Vec<u8>>, TransportError> {
    self
      .socket
      .set_read_timeout(Some(timeout.max(Duration::from_millis(1))))
      .map_err(|_| TransportError::Failed)?;
    let mut buffer = [0_u8; 64];
    match self.socket.recv(&mut buffer) {
      Ok(len) => {
        let packet = buffer[..len].to_vec();
        // A channel allocation response: control byte 0x41 on the broadcast channel. The
        // payload is the nonce (8 bytes), the channel (2) and the device properties.
        if len >= 15 && packet[0] == 0x41 && packet[1..3] == [0xff, 0xff] {
          self.channel.store(
            u32::from(u16::from_be_bytes([packet[13], packet[14]])),
            Ordering::SeqCst,
          );
        }
        Ok(Some(packet))
      }
      Err(error)
        if matches!(
          error.kind(),
          IoErrorKind::WouldBlock | IoErrorKind::TimedOut
        ) =>
      {
        Ok(None)
      }
      Err(_) => Err(TransportError::Failed),
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The debug link: protocol v1 over UDP.

struct DebugLink {
  socket: UdpSocket,
}

impl DebugLink {
  fn open(port: u16) -> DebugLink {
    let socket = UdpSocket::bind("127.0.0.1:0").expect("a UDP socket");
    socket.connect(("127.0.0.1", port)).expect("a UDP peer");
    socket
      .set_read_timeout(Some(Duration::from_secs(5)))
      .expect("a timeout");
    DebugLink { socket }
  }

  fn send<M: Wire>(&mut self, message: &M) {
    let body = message.encode_to_vec();
    let mut data = Vec::with_capacity(9 + body.len());
    data.extend_from_slice(b"?##");
    data.extend_from_slice(&M::TYPE.to_be_bytes());
    data.extend_from_slice(&(body.len() as u32).to_be_bytes());
    data.extend_from_slice(&body);
    let mut first = true;
    // The first chunk holds 64 bytes of the data, and each next one holds 63 behind a `?`.
    let mut rest = data.as_slice();
    while !rest.is_empty() {
      let mut packet = [0_u8; 64];
      let take = if first { 64 } else { 63 }.min(rest.len());
      if first {
        packet[..take].copy_from_slice(&rest[..take]);
      } else {
        packet[0] = b'?';
        packet[1..=take].copy_from_slice(&rest[..take]);
      }
      self.socket.send(&packet).expect("a debug link packet");
      rest = &rest[take..];
      first = false;
      std::thread::sleep(Duration::from_millis(1));
    }
  }

  fn receive(&mut self) -> Option<(u16, Vec<u8>)> {
    let mut packet = [0_u8; 64];
    let len = self.socket.recv(&mut packet).ok()?;
    if len < 9 || &packet[..3] != b"?##" {
      return None;
    }
    let message_type = u16::from_be_bytes([packet[3], packet[4]]);
    let size = u32::from_be_bytes([packet[5], packet[6], packet[7], packet[8]]) as usize;
    let mut body = packet[9..len.min(9 + size)].to_vec();
    while body.len() < size {
      let len = self.socket.recv(&mut packet).ok()?;
      if len < 1 || packet[0] != b'?' {
        return None;
      }
      let take = (size - body.len()).min(len - 1);
      body.extend_from_slice(&packet[1..=take]);
    }
    Some((message_type, body))
  }

  /// A decision has no answer. A request that has one follows it, so the harness knows that the
  /// device handled the decision.
  fn decide(&mut self, decision: &DebugLinkDecision) {
    self.send(decision);
    self.send(&DebugLinkGetState {
      wait_layout: None,
      return_empty_state: Some(true),
    });
    let _ = self.receive();
  }

  /// The layout on the screen, as one string of JSON. Empty when there is none.
  fn layout(&mut self) -> String {
    self.send(&DebugLinkGetState {
      wait_layout: Some(0),
      return_empty_state: None,
    });
    match self.receive() {
      Some((DebugLinkState::TYPE, body)) => DebugLinkState::decode(body.as_slice())
        .map(|state| state.tokens.concat())
        .unwrap_or_default(),
      _ => String::new(),
    }
  }

  fn pairing_code(&mut self, channel: u16) -> Option<String> {
    self.send(&DebugLinkGetPairingInfo {
      channel_id: Some(channel.to_be_bytes().to_vec()),
    });
    match self.receive() {
      Some((DebugLinkPairingInfo::TYPE, body)) => DebugLinkPairingInfo::decode(body.as_slice())
        .ok()
        .and_then(|info| info.code_entry_code)
        // The device does not write the leading zeros.
        .map(|code| format!("{code:06}")),
      _ => None,
    }
  }
}

/// What the user does on the screens of the device.
struct Script {
  /// Types this when the device asks for a PIN.
  pin: Option<&'static str>,
  /// Types this when the device asks for a passphrase.
  passphrase: Option<&'static str>,
  /// Presses "no" on the screens of the transaction.
  reject_transaction: AtomicBool,
  /// Confirms nothing. The session must stop on its own.
  stop: AtomicBool,
  /// Presses "no" on the dialog that asks to allow the connection.
  refuse_pairing: AtomicBool,
  /// Every text screen that the device showed, once each and in order.
  seen: Mutex<Vec<String>>,
}

/// The text of a layout without its markup, with the line breaks of the screen read as spaces. The
/// device breaks its lines where they fit, so a phrase may span two tokens of the layout.
fn plain(layout: &str) -> String {
  layout
    .replace("\\n", " ")
    .replace(['"', ',', '[', ']', '{', '}', ':'], " ")
    .split_whitespace()
    .collect::<Vec<_>>()
    .join(" ")
}

/// True for the screen that shows the pairing code.
fn is_code_screen(layout: &str) -> bool {
  plain(layout).contains("one-time security code")
}

/// Remembers a text screen, once for each time that it appears.
fn note_screen(script: &Script, layout: &str) {
  let mut seen = script.seen.lock().expect("the screen log");
  if seen.last().map(String::as_str) != Some(layout) {
    seen.push(layout.to_string());
  }
}

/// Presses the buttons while a session runs on the main thread. It confirms every text screen
/// except the code screen, and types the PIN and the passphrase on their keyboards.
struct Presser {
  script: Arc<Script>,
  thread: Option<JoinHandle<()>>,
}

impl Presser {
  fn start(debug: Arc<Mutex<DebugLink>>, script: Arc<Script>) -> Presser {
    let thread_script = Arc::clone(&script);
    let thread = std::thread::spawn(move || {
      while !thread_script.stop.load(Ordering::SeqCst) {
        let layout = debug.lock().expect("the debug link").layout();
        let decision = if layout.contains("\"PinKeyboard\"") {
          thread_script.pin.map(|pin| DebugLinkDecision {
            button: None,
            input: Some(pin.to_string()),
          })
        } else if layout.contains("\"StringKeyboard\"") {
          thread_script
            .passphrase
            .map(|passphrase| DebugLinkDecision {
              button: None,
              input: Some(passphrase.to_string()),
            })
        } else if layout.contains("\"TextScreen\"") && !is_code_screen(&layout) {
          let transaction = layout.contains("Recipient") || layout.contains("Total amount");
          let pairing = layout.contains("pair with this");
          let reject = (transaction && thread_script.reject_transaction.load(Ordering::SeqCst))
            || (pairing && thread_script.refuse_pairing.load(Ordering::SeqCst));
          note_screen(&thread_script, &layout);
          Some(DebugLinkDecision {
            button: Some(u32::from(!reject)),
            input: None,
          })
        } else {
          if is_code_screen(&layout) {
            note_screen(&thread_script, &layout);
          }
          None
        };
        if let Some(decision) = decision {
          debug.lock().expect("the debug link").decide(&decision);
        }
        std::thread::sleep(Duration::from_millis(150));
      }
    });
    Presser {
      script,
      thread: Some(thread),
    }
  }
}

impl Drop for Presser {
  fn drop(&mut self) {
    self.script.stop.store(true, Ordering::SeqCst);
    if let Some(thread) = self.thread.take() {
      let _ = thread.join();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// One test's device.

#[derive(Clone, Copy, PartialEq)]
enum Code {
  Right,
  Wrong,
  Cancel,
}

struct RigUi {
  debug: Arc<Mutex<DebugLink>>,
  channel: Arc<AtomicU32>,
  code: Code,
  events: Vec<Progress>,
}

impl Ui for RigUi {
  fn progress(&mut self, progress: Progress) {
    self.events.push(progress);
  }

  fn pairing_code(&mut self, wait: Duration) -> CodeEntry {
    if self.code == Code::Cancel {
      return CodeEntry::Cancelled;
    }
    let channel = u16::try_from(self.channel.load(Ordering::SeqCst)).expect("a channel number");
    // The device shows the code when it has answered the challenge, which is before this call.
    // The debug link may need a moment.
    let Some(code) = self
      .debug
      .lock()
      .expect("the debug link")
      .pairing_code(channel)
    else {
      std::thread::sleep(wait);
      return CodeEntry::Pending;
    };
    CodeEntry::Entered(match self.code {
      Code::Wrong => {
        let first = if code.starts_with('0') { '1' } else { '0' };
        format!("{first}{}", &code[1..])
      }
      _ => code,
    })
  }
}

struct Emulator {
  rig: Rig,
  debug: Arc<Mutex<DebugLink>>,
  channel: Arc<AtomicU32>,
  script: Arc<Script>,
  _presser: Presser,
}

/// BIP-39 mnemonics that are valid, for the vaults that need another key.
const MNEMONICS: [&str; 5] = [
  "all all all all all all all all all all all all",
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  "legal winner thank year wave sausage worth useful legal winner thank yellow",
  "letter advice cage absurd amount doctor acoustic avoid letter advice cage above",
  "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong",
];

/// The master key of a mnemonic and a passphrase, as BIP-39 and BIP-32 define it.
fn master_of(mnemonic: &str, passphrase: &str, kind: NetworkKind) -> Xpriv {
  let mut seed = [0_u8; 64];
  pbkdf2::pbkdf2_hmac::<Sha512>(
    mnemonic.as_bytes(),
    format!("mnemonic{passphrase}").as_bytes(),
    2048,
    &mut seed,
  );
  Xpriv::new_master(kind, &seed).expect("a master key")
}

/// The first mnemonic whose keys make a vault with the device at `slot` (or anywhere) that is
/// unsorted at every funded address.
fn vault_for(slot: Option<usize>, network: Network) -> (&'static str, Vault) {
  for mnemonic in MNEMONICS {
    let master = master_of(mnemonic, "", NetworkKind::from(network));
    let made = std::panic::catch_unwind(|| match slot {
      Some(slot) => Vault::with_device_at(&master, network, slot),
      None => Vault::new(&master, network),
    });
    if let Ok(vault) = made {
      return (mnemonic, vault);
    }
  }
  panic!("no mnemonic gives a vault with the device at {slot:?}");
}

impl Emulator {
  fn start(script: Script) -> Option<Emulator> {
    if std::env::var_os("TREZOR_EMULATOR").is_none() {
      // CI sets this variable, so that a rig that is not set up fails the job and does not
      // turn every emulator test into a pass that tested nothing.
      assert!(
        std::env::var_os("TREZOR_EMULATOR_REQUIRED").is_none(),
        "TREZOR_EMULATOR_REQUIRED is set, but TREZOR_EMULATOR is not. The emulator rig is missing."
      );
      println!("skipped: TREZOR_EMULATOR is not set");
      return None;
    }
    let rig = Rig::start();
    let debug = Arc::new(Mutex::new(DebugLink::open(rig.udp_port + 1)));
    let script = Arc::new(script);
    let presser = Presser::start(Arc::clone(&debug), Arc::clone(&script));
    Some(Emulator {
      rig,
      debug,
      channel: Arc::new(AtomicU32::new(0)),
      script,
      _presser: presser,
    })
  }

  fn default_script() -> Script {
    Script {
      pin: None,
      passphrase: None,
      reject_transaction: AtomicBool::new(false),
      stop: AtomicBool::new(false),
      refuse_pairing: AtomicBool::new(false),
      seen: Mutex::new(Vec::new()),
    }
  }

  fn transport(&self) -> UdpTransport {
    let socket = UdpSocket::bind("127.0.0.1:0").expect("a UDP socket");
    socket
      .connect(("127.0.0.1", self.rig.udp_port))
      .expect("a UDP peer");
    UdpTransport {
      socket,
      channel: Arc::clone(&self.channel),
    }
  }

  fn ui(&self, code: Code) -> RigUi {
    RigUi {
      debug: Arc::clone(&self.debug),
      channel: Arc::clone(&self.channel),
      code,
      events: Vec::new(),
    }
  }

  /// Loads a seed into the device, through a session of its own. Only an emulator takes this.
  fn load_seed(&self, mnemonic: &str, pin: Option<&str>, passphrase_protection: bool) {
    let mut ui = self.ui(Code::Right);
    let (link, _) = connect(self.transport(), &mut ui).expect("a channel");
    let mut device = Device::new(link, &mut ui);
    device.pair().expect("the pairing");
    let _: Success = device
      .call(
        0,
        &LoadDevice {
          mnemonics: vec![mnemonic.to_string()],
          pin: pin.map(str::to_string),
          passphrase_protection: passphrase_protection.then_some(true),
          label: Some("SVRA test".to_string()),
        },
        USER,
        Step::Query,
        None,
      )
      .expect("the device takes the seed");
    // The device that took the seed is unlocked. A device that has a PIN locks again when the
    // user says so, as it does after its idle time.
    if pin.is_some() {
      let _: Success = device
        .call(0, &LockDevice {}, USER, Step::Query, None)
        .expect("the device locks");
    }
  }

  /// Makes the device ask for the passphrase on its own screen for every wallet.
  fn ask_for_the_passphrase_on_the_device(&self) {
    let mut ui = self.ui(Code::Right);
    let (link, _) = connect(self.transport(), &mut ui).expect("a channel");
    let mut device = Device::new(link, &mut ui);
    device.pair().expect("the pairing");
    let _: Success = device
      .call(
        0,
        &ApplySettings {
          passphrase_always_on_device: Some(true),
        },
        USER,
        Step::Query,
        None,
      )
      .expect("the device takes the setting");
  }

  /// The text screens that the device showed so far, as the debug link gives them.
  fn screens(&self) -> Vec<String> {
    self.script.seen.lock().expect("the screen log").clone()
  }

  fn sign(
    &self,
    vault: &mut Vault,
    psbt: Option<Psbt>,
    code: Code,
  ) -> (Result<SignOutcome, Error>, Vec<Progress>) {
    let psbt = psbt.unwrap_or_else(|| vault.sweep_psbt());
    let mut ui = self.ui(code);
    let result = sign_psbt(
      self.transport(),
      SignRequest {
        network: vault.network,
        receive_descriptor: &vault.receive_descriptor,
        change_descriptor: Some(&vault.change_descriptor),
        psbt,
      },
      &mut ui,
    );
    (result, ui.events)
  }
}

const NORMAL_RUN: [Progress; 5] = [
  Progress::Connecting,
  Progress::ConfirmConnection,
  Progress::EnterPairingCode,
  Progress::CheckingKey,
  Progress::Sign,
];

/// Adds the second customer key's signature and checks every input against the consensus rules.
fn finalize(vault: &Vault, outcome: SignOutcome) {
  assert!(outcome.signed);
  let mut psbt = outcome.psbt;
  sign_with(&vault.keys.software_xprv, &mut psbt);
  vault.finalize_and_verify(psbt);
}

fn error_of(result: Result<SignOutcome, Error>) -> Error {
  match result {
    Ok(_) => panic!("the session succeeded"),
    Err(error) => error,
  }
}

// ---------------------------------------------------------------------------------------------
// The tests.

fn signs_with_the_device_at(slot: usize) {
  let (mnemonic, mut vault) = vault_for(Some(slot), Network::Testnet);
  assert_eq!(vault.order[slot], 0);
  let Some(emulator) = Emulator::start(Emulator::default_script()) else {
    return;
  };
  emulator.load_seed(mnemonic, None, false);
  let (result, events) = emulator.sign(&mut vault, None, Code::Right);
  let outcome = result.unwrap_or_else(|error| panic!("slot {slot}: {error}"));
  assert_eq!(events, NORMAL_RUN);
  assert_eq!(outcome.fingerprint, vault.device_fingerprint);
  finalize(&vault, outcome);
}

#[test]
fn the_device_signs_at_position_0_of_the_descriptor() {
  signs_with_the_device_at(0);
}

#[test]
fn the_device_signs_at_position_1_of_the_descriptor() {
  signs_with_the_device_at(1);
}

#[test]
fn the_device_signs_at_position_2_of_the_descriptor() {
  signs_with_the_device_at(2);
}

#[test]
fn a_mainnet_vault_signs() {
  let (mnemonic, mut vault) = vault_for(None, Network::Bitcoin);
  let Some(emulator) = Emulator::start(Emulator::default_script()) else {
    return;
  };
  emulator.load_seed(mnemonic, None, false);
  let (result, _) = emulator.sign(&mut vault, None, Code::Right);
  finalize(&vault, result.expect("the session signs"));
}

#[test]
fn a_regtest_vault_signs() {
  let (mnemonic, mut vault) = vault_for(None, Network::Regtest);
  let Some(emulator) = Emulator::start(Emulator::default_script()) else {
    return;
  };
  emulator.load_seed(mnemonic, None, false);
  let (result, _) = emulator.sign(&mut vault, None, Code::Right);
  finalize(&vault, result.expect("the session signs"));
}

#[test]
fn a_psbt_that_the_other_customer_key_signed_first_signs() {
  let (mnemonic, mut vault) = vault_for(None, Network::Testnet);
  let Some(emulator) = Emulator::start(Emulator::default_script()) else {
    return;
  };
  emulator.load_seed(mnemonic, None, false);
  let mut psbt = vault.sweep_psbt();
  sign_with(&vault.keys.software_xprv, &mut psbt);
  let (result, _) = emulator.sign(&mut vault, Some(psbt), Code::Right);
  let outcome = result.expect("the session signs");
  assert!(outcome
    .psbt
    .inputs
    .iter()
    .all(|input| input.partial_sigs.len() == 2));
  vault.finalize_and_verify(outcome.psbt);
}

#[test]
fn a_multipath_wallet_configuration_signs() {
  let (mnemonic, mut vault) = vault_for(None, Network::Testnet);
  let Some(emulator) = Emulator::start(Emulator::default_script()) else {
    return;
  };
  emulator.load_seed(mnemonic, None, false);
  let psbt = vault.sweep_psbt();
  let mut ui = emulator.ui(Code::Right);
  let outcome = sign_psbt(
    emulator.transport(),
    SignRequest {
      network: Network::Testnet,
      receive_descriptor: &vault.multipath_descriptor,
      change_descriptor: None,
      psbt,
    },
    &mut ui,
  )
  .expect("the session signs");
  finalize(&vault, outcome);
}

#[test]
fn a_payment_with_change_signs() {
  let (mnemonic, mut vault) = vault_for(None, Network::Testnet);
  let Some(emulator) = Emulator::start(Emulator::default_script()) else {
    return;
  };
  emulator.load_seed(mnemonic, None, false);
  let psbt = vault.spend_with_change_psbt(120_000);
  let (result, _) = emulator.sign(&mut vault, Some(psbt), Code::Right);
  let outcome = result.expect("the session signs");
  let mut psbt = outcome.psbt;
  sign_with(&vault.keys.software_xprv, &mut psbt);
  vault.finalize_and_verify(psbt);
}

#[test]
fn a_psbt_that_the_device_already_signed_is_returned_unchanged() {
  let (mnemonic, mut vault) = vault_for(None, Network::Testnet);
  let Some(emulator) = Emulator::start(Emulator::default_script()) else {
    return;
  };
  emulator.load_seed(mnemonic, None, false);
  let mut psbt = vault.sweep_psbt();
  sign_with(&vault.keys.device_xprv, &mut psbt);
  let before = psbt.clone();
  let (result, events) = emulator.sign(&mut vault, Some(psbt), Code::Right);
  let outcome = result.expect("the session ends well");
  assert!(!outcome.signed);
  assert_eq!(outcome.psbt, before);
  assert!(!events.contains(&Progress::Sign));
}

#[test]
fn a_device_without_a_wallet_is_refused() {
  let (_, mut vault) = vault_for(None, Network::Testnet);
  let Some(emulator) = Emulator::start(Emulator::default_script()) else {
    return;
  };
  let (result, _) = emulator.sign(&mut vault, None, Code::Right);
  assert_eq!(error_of(result).kind, ErrorKind::NotInitialized);
}

#[test]
fn a_device_without_the_key_of_the_vault_is_refused() {
  let (mnemonic, mut vault) = vault_for(None, Network::Testnet);
  let Some(emulator) = Emulator::start(Emulator::default_script()) else {
    return;
  };
  let other = MNEMONICS
    .iter()
    .find(|other| **other != mnemonic)
    .expect("another mnemonic");
  emulator.load_seed(other, None, false);
  let (result, events) = emulator.sign(&mut vault, None, Code::Right);
  let error = error_of(result);
  assert_eq!(error.kind, ErrorKind::KeyNotInVault);
  // Without passphrase protection the device is not asked for a passphrase.
  assert!(!events.contains(&Progress::Passphrase));
}

#[test]
fn a_wrong_pairing_code_ends_the_session_and_the_next_one_works() {
  let (mnemonic, mut vault) = vault_for(None, Network::Testnet);
  let Some(emulator) = Emulator::start(Emulator::default_script()) else {
    return;
  };
  emulator.load_seed(mnemonic, None, false);
  let (result, events) = emulator.sign(&mut vault, None, Code::Wrong);
  let error = error_of(result);
  assert_eq!(error.kind, ErrorKind::PairingRejected);
  assert!(error.message.contains("Start again"), "{}", error.message);
  assert!(!events.contains(&Progress::CheckingKey));

  // The device is back at its home screen, and a new session pairs again.
  let (result, events) = emulator.sign(&mut vault, None, Code::Right);
  assert_eq!(events, NORMAL_RUN);
  finalize(&vault, result.expect("the session signs"));
}

#[test]
fn cancelling_in_the_app_leaves_the_device_ready_for_the_next_session() {
  let (mnemonic, mut vault) = vault_for(None, Network::Testnet);
  let Some(emulator) = Emulator::start(Emulator::default_script()) else {
    return;
  };
  emulator.load_seed(mnemonic, None, false);
  let (result, _) = emulator.sign(&mut vault, None, Code::Cancel);
  assert_eq!(error_of(result).kind, ErrorKind::UserAbort);
  let (result, _) = emulator.sign(&mut vault, None, Code::Right);
  finalize(&vault, result.expect("the session signs"));
}

#[test]
fn rejecting_the_transaction_on_the_device_is_a_user_abort() {
  let (mnemonic, mut vault) = vault_for(None, Network::Testnet);
  let Some(emulator) = Emulator::start(Emulator::default_script()) else {
    return;
  };
  emulator.load_seed(mnemonic, None, false);
  emulator
    .script
    .reject_transaction
    .store(true, Ordering::SeqCst);
  let (result, events) = emulator.sign(&mut vault, None, Code::Right);
  let error = error_of(result);
  assert_eq!(error.kind, ErrorKind::UserAbort);
  assert_eq!(events.last(), Some(&Progress::Sign));
}

#[test]
fn a_device_with_a_pin_is_unlocked_on_the_device_and_signs() {
  let (mnemonic, mut vault) = vault_for(None, Network::Testnet);
  let Some(emulator) = Emulator::start(Script {
    pin: Some("1234"),
    ..Emulator::default_script()
  }) else {
    return;
  };
  emulator.load_seed(mnemonic, Some("1234"), false);
  let (result, events) = emulator.sign(&mut vault, None, Code::Right);
  let outcome = result.expect("the session signs");
  assert!(events.contains(&Progress::Unlock), "{events:?}");
  finalize(&vault, outcome);
}

#[test]
fn the_wallet_with_a_passphrase_is_opened_when_the_standard_wallet_lacks_the_key() {
  // The vault holds the key of the wallet that the passphrase opens.
  let mnemonic = MNEMONICS[0];
  let master = master_of(mnemonic, "hunter2", NetworkKind::Test);
  let mut vault = Vault::new(&master, Network::Testnet);
  let Some(emulator) = Emulator::start(Script {
    passphrase: Some("hunter2"),
    ..Emulator::default_script()
  }) else {
    return;
  };
  emulator.load_seed(mnemonic, None, true);
  let (result, events) = emulator.sign(&mut vault, None, Code::Right);
  let outcome = result.expect("the session signs");
  assert!(events.contains(&Progress::Passphrase), "{events:?}");
  finalize(&vault, outcome);
}

#[test]
fn a_wrong_passphrase_finds_no_key() {
  let mnemonic = MNEMONICS[0];
  let master = master_of(mnemonic, "hunter2", NetworkKind::Test);
  let mut vault = Vault::new(&master, Network::Testnet);
  let Some(emulator) = Emulator::start(Script {
    passphrase: Some("hunter3"),
    ..Emulator::default_script()
  }) else {
    return;
  };
  emulator.load_seed(mnemonic, None, true);
  let (result, _) = emulator.sign(&mut vault, None, Code::Right);
  assert_eq!(error_of(result).kind, ErrorKind::KeyNotInVault);
}

// ---------------------------------------------------------------------------------------------
// The code step: the device speaks while the app waits for the user.

/// A user who presses the button of the code screen, which cancels the pairing on the device,
/// and then types nothing. The session has to notice by itself.
struct CancelOnDeviceUi {
  inner: RigUi,
  /// The code screen as it was when the user pressed it, and the moment of the press.
  pressed: Option<(String, Instant)>,
}

impl Ui for CancelOnDeviceUi {
  fn progress(&mut self, progress: Progress) {
    self.inner.progress(progress);
  }

  fn pairing_code(&mut self, wait: Duration) -> CodeEntry {
    if self.pressed.is_some() {
      std::thread::sleep(wait);
      return CodeEntry::Pending;
    }
    for _ in 0..100 {
      let screen = self.inner.debug.lock().expect("the debug link").layout();
      if is_code_screen(&screen) {
        self
          .inner
          .debug
          .lock()
          .expect("the debug link")
          .decide(&DebugLinkDecision {
            button: Some(1),
            input: None,
          });
        self.pressed = Some((screen, Instant::now()));
        return CodeEntry::Pending;
      }
      std::thread::sleep(Duration::from_millis(50));
    }
    panic!("the device never showed its code screen");
  }
}

#[test]
fn cancelling_on_the_code_screen_ends_the_session_at_once_and_the_next_one_works() {
  let (mnemonic, mut vault) = vault_for(None, Network::Testnet);
  let Some(emulator) = Emulator::start(Emulator::default_script()) else {
    return;
  };
  emulator.load_seed(mnemonic, None, false);
  let mut ui = CancelOnDeviceUi {
    inner: emulator.ui(Code::Right),
    pressed: None,
  };
  let psbt = vault.sweep_psbt();
  let result = sign_psbt(
    emulator.transport(),
    SignRequest {
      network: vault.network,
      receive_descriptor: &vault.receive_descriptor,
      change_descriptor: Some(&vault.change_descriptor),
      psbt,
    },
    &mut ui,
  );
  let (screen, pressed_at) = ui.pressed.take().expect("the user pressed the code screen");
  let error = error_of(result);
  // The review measured about 21 seconds and a wrong message on the same device.
  println!(
    "the cancel on the code screen ended the session after {:?}",
    pressed_at.elapsed()
  );
  assert!(
    pressed_at.elapsed() < Duration::from_secs(5),
    "{:?}",
    pressed_at.elapsed()
  );
  assert_eq!(error.kind, ErrorKind::PairingRejected);
  assert!(
    error.message.contains("cancelled on the Trezor"),
    "{}",
    error.message
  );
  assert!(!error.message.contains("ten minutes"), "{}", error.message);
  // The code screen names the computer, as the connection dialog does.
  assert!(plain(&screen).contains("on this computer"), "{screen}");

  // The device is back at its home screen, and a new session pairs again.
  let (result, events) = emulator.sign(&mut vault, None, Code::Right);
  assert_eq!(events, NORMAL_RUN);
  finalize(&vault, result.expect("the session signs"));
}

#[test]
fn the_dialogs_name_the_app_and_the_computer_and_fit_the_screen() {
  let (mnemonic, mut vault) = vault_for(None, Network::Testnet);
  let Some(emulator) = Emulator::start(Emulator::default_script()) else {
    return;
  };
  emulator.load_seed(mnemonic, None, false);
  let (result, _) = emulator.sign(&mut vault, None, Code::Right);
  result.expect("the session signs");
  let screens = emulator.screens();
  let dialog = screens
    .iter()
    .find(|screen| screen.contains("pair with this"))
    .expect("the connection dialog was shown");
  // The device breaks the text into lines, and keeps the words whole.
  assert!(dialog.contains("Swan Vault"), "{dialog}");
  assert!(dialog.contains("Recovery Assistant"), "{dialog}");
  assert!(dialog.contains("this computer"), "{dialog}");
  assert!(dialog.contains("\"fits\": true"), "{dialog}");
  assert!(!dialog.contains("\"-\""), "a word was cut: {dialog}");
}

#[test]
fn refusing_the_pairing_dialog_on_the_device_is_a_rejected_pairing_and_the_next_session_works() {
  let (mnemonic, mut vault) = vault_for(None, Network::Testnet);
  let Some(emulator) = Emulator::start(Emulator::default_script()) else {
    return;
  };
  emulator.load_seed(mnemonic, None, false);
  emulator.script.refuse_pairing.store(true, Ordering::SeqCst);
  let (result, events) = emulator.sign(&mut vault, None, Code::Right);
  let error = error_of(result);
  assert_eq!(error.kind, ErrorKind::PairingRejected);
  assert!(
    error.message.contains("cancelled on the Trezor"),
    "{}",
    error.message
  );
  assert_eq!(events, [Progress::Connecting, Progress::ConfirmConnection]);

  emulator
    .script
    .refuse_pairing
    .store(false, Ordering::SeqCst);
  let (result, _) = emulator.sign(&mut vault, None, Code::Right);
  finalize(&vault, result.expect("the session signs"));
}

// ---------------------------------------------------------------------------------------------
// What the device is asked to sign.

#[test]
fn a_previous_transaction_with_witness_data_signs() {
  let (mnemonic, mut vault) = vault_for(None, Network::Testnet);
  let Some(emulator) = Emulator::start(Emulator::default_script()) else {
    return;
  };
  emulator.load_seed(mnemonic, None, false);
  let mut psbt = vault.sweep_psbt();
  for input in &mut psbt.inputs {
    let previous = input
      .non_witness_utxo
      .as_mut()
      .expect("the previous transaction");
    let txid = previous.compute_txid();
    // The witness is not part of the transaction id, and the device never sees it.
    previous.input[0].witness = Witness::from_slice(&[vec![0x30; 71], vec![0x02; 33]]);
    assert_eq!(previous.compute_txid(), txid);
    assert_ne!(previous.compute_wtxid().to_string(), txid.to_string());
  }
  let (result, _) = emulator.sign(&mut vault, Some(psbt), Code::Right);
  finalize(&vault, result.expect("the session signs"));
}

#[test]
fn two_inputs_that_spend_outputs_of_the_same_previous_transaction_sign() {
  let (mnemonic, mut vault) = vault_for(None, Network::Testnet);
  let Some(emulator) = Emulator::start(Emulator::default_script()) else {
    return;
  };
  emulator.load_seed(mnemonic, None, false);
  let mut psbt = vault.sweep_psbt();
  // One previous transaction that pays to the first two inputs' addresses.
  let spent: Vec<TxOut> = psbt.inputs[..2]
    .iter()
    .map(|input| input.witness_utxo.clone().expect("a utxo"))
    .collect();
  let shared = Transaction {
    output: spent,
    ..crate::test_support::funding_transaction(0x77, bitcoin::ScriptBuf::new(), 1)
  };
  for (position, input) in psbt.inputs[..2].iter_mut().enumerate() {
    input.non_witness_utxo = Some(shared.clone());
    psbt.unsigned_tx.input[position].previous_output = OutPoint {
      txid: shared.compute_txid(),
      vout: position as u32,
    };
  }
  let (result, _) = emulator.sign(&mut vault, Some(psbt), Code::Right);
  finalize(&vault, result.expect("the session signs"));
}

#[test]
fn an_output_to_an_own_receive_address_is_shown_as_a_payment() {
  let (mnemonic, mut vault) = vault_for(None, Network::Testnet);
  let Some(emulator) = Emulator::start(Emulator::default_script()) else {
    return;
  };
  emulator.load_seed(mnemonic, None, false);
  let mut psbt = vault.spend_with_change_psbt(120_000);
  let payment = psbt
    .outputs
    .iter()
    .position(|output| output.bip32_derivation.is_empty())
    .expect("the payment output");
  let address = vault.pay_to_own_address(&mut psbt, payment, KeychainKind::External, 5);
  let (result, _) = emulator.sign(&mut vault, Some(psbt), Code::Right);
  let outcome = result.expect("the session signs");
  let screens = emulator.screens();
  // The device shows the receive address as a recipient, and the change as nothing.
  let start = &address.to_string()[..12];
  assert!(
    screens
      .iter()
      .any(|screen| screen.contains("Recipient #1") && screen.contains(start)),
    "{screens:?}"
  );
  assert!(
    !screens.iter().any(|screen| screen.contains("Recipient #2")),
    "{screens:?}"
  );
  let mut psbt = outcome.psbt;
  sign_with(&vault.keys.software_xprv, &mut psbt);
  vault.finalize_and_verify(psbt);
}

#[test]
fn a_change_output_at_a_high_address_number_is_refused_before_the_device_signs() {
  let (mnemonic, mut vault) = vault_for(None, Network::Testnet);
  let Some(emulator) = Emulator::start(Emulator::default_script()) else {
    return;
  };
  emulator.load_seed(mnemonic, None, false);
  let mut psbt = vault.spend_with_change_psbt(120_000);
  let change = psbt
    .outputs
    .iter()
    .position(|output| !output.bip32_derivation.is_empty())
    .expect("the change output");
  // The script and the key origin are right. Only the address number is out of reach of a wallet.
  vault.pay_to_own_address(&mut psbt, change, KeychainKind::Internal, 500_000);
  let (result, events) = emulator.sign(&mut vault, Some(psbt), Code::Right);
  let error = error_of(result);
  assert_eq!(error.kind, ErrorKind::InvalidPsbt);
  assert!(error.message.contains("500000"), "{}", error.message);
  assert!(!events.contains(&Progress::Sign), "{events:?}");
  // The device never showed a screen of the transaction.
  assert!(
    !emulator
      .screens()
      .iter()
      .any(|screen| screen.contains("Recipient") || screen.contains("Total amount")),
    "{:?}",
    emulator.screens()
  );
}

#[test]
fn a_lock_time_adds_a_screen_and_the_transaction_signs() {
  let (mnemonic, mut vault) = vault_for(None, Network::Testnet);
  let Some(emulator) = Emulator::start(Emulator::default_script()) else {
    return;
  };
  emulator.load_seed(mnemonic, None, false);
  let mut psbt = vault.sweep_psbt();
  psbt.unsigned_tx.lock_time = LockTime::from_height(800_000).expect("a block height");
  let (result, _) = emulator.sign(&mut vault, Some(psbt), Code::Right);
  let outcome = result.expect("the session signs");
  assert_eq!(
    outcome.psbt.unsigned_tx.lock_time.to_consensus_u32(),
    800_000
  );
  assert!(
    emulator
      .screens()
      .iter()
      .any(|screen| screen.contains("800000")),
    "{:?}",
    emulator.screens()
  );
  finalize(&vault, outcome);
}

#[test]
fn a_device_that_always_asks_for_the_passphrase_on_its_screen_signs() {
  let mnemonic = MNEMONICS[0];
  let master = master_of(mnemonic, "hunter2", NetworkKind::Test);
  let mut vault = Vault::new(&master, Network::Testnet);
  let Some(emulator) = Emulator::start(Script {
    passphrase: Some("hunter2"),
    ..Emulator::default_script()
  }) else {
    return;
  };
  emulator.load_seed(mnemonic, None, true);
  emulator.ask_for_the_passphrase_on_the_device();
  let (result, events) = emulator.sign(&mut vault, None, Code::Right);
  let outcome = result.expect("the session signs");
  // The passphrase is asked once, before the first look at the keys, as the device does it.
  assert_eq!(
    events,
    [
      Progress::Connecting,
      Progress::ConfirmConnection,
      Progress::EnterPairingCode,
      Progress::CheckingKey,
      Progress::Passphrase,
      Progress::Sign,
    ]
  );
  finalize(&vault, outcome);
}
