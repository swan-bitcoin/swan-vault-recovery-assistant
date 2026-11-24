# Swan Vault Recovery Assistant

Swan Vault Recovery Assistant is a desktop application that helps you verify and restore your Bitcoin wallet without requiring you to type in your recovery phrases. Whether you are testing the recovery process for peace of mind or need to regain access to your funds, Swan Vault Recovery Assistant puts you in control.

## Features

- **Import Your Wallet**: To view your wallet, simply paste your descriptor containing your wallet configuration.
- **Don’t Trust, Verify**: View your wallet in watch-only mode at any time. Double-check your balance, transaction history, and next unused address.
- **Sign a Transaction**: Connect your signing device via USB to approve transactions securely. Your keys stay in cold storage.

## Benefits

- **Easy**: Designed to be straightforward, with no complicated setup.
- **Private**: No data collected or stored on your computer.
- **Secure**: Open-source with minimal software dependencies so any developer can audit.

# FAQ

> Does Swan Vault Recovery Assistant ask for my recovery phrase?

No. To view your wallet, Swan Vault Recovery Assistant only needs your wallet configuration (or descriptor), which doesn’t include your keys and can’t authorize transactions. To send funds, you need to connect your signing device via USB and approve the transaction shown on its screen. Your keys never leave your hardware devices.

> Why do I need the wallet descriptor?

Recovery phrases alone are not enough to restore wallets. You also need the wallet configuration, including the script type, public keys, derivation paths, and spending conditions. Descriptors are a widely adopted standard for backing up all of this information in one easily copyable string.

> Can I manually enter my extended public keys (or XPUBs)?

No. While XPUBs are necessary and included in the wallet configuration (or descriptor), restoring a Bitcoin wallet requires additional information like the script type, derivation paths, and spending conditions. Entering these technical details manually increases the risk of human error. To prevent mistakes, Swan Vault Recovery Assistant only supports descriptors.

> What wallets and signing devices does Swan Vault Recovery Assistant support?

Swan Vault Recovery Assistant can import any wallet that supports exporting its configuration as output descriptors, including Swan Vault and many modern Bitcoin wallets. For signing transactions, Blockstream Jade is officially supported for use with Swan Vault Recovery Assistant. The BitBox02 Nova Bitcoin-only is supported for Swan Vault recovery. If the BitBox02 does not know your vault yet, for example after a reset, it shows each key for you to confirm. See [Using a BitBox02](#using-a-bitbox02) for how to use it, and [Device Support](#device-support) for how it differs from Jade. The Trezor Safe 7 is supported for Swan Vault recovery. It does not store your vault, so it cannot check that the keys are yours. See [Using a Trezor Safe 7](#using-a-trezor-safe-7) for how to use it, and [Device Support](#device-support) for how it differs from Jade.

> Does Swan Vault Recovery Assistant collect any data?

Swan Vault Recovery Assistant does not collect any data. However, to display your balance and transaction history, it scans the blockchain through a server. As a result, this server will learn which Bitcoin addresses are associated with your IP address. While this affects privacy, it does not compromise security, since the server cannot access your keys or authorize transactions. By default, Swan Vault Recovery Assistant connects to Blockstream’s server due to its strong reputation, but advanced users can choose a different server or run their own to improve privacy.

# Using a BitBox02

You can sign a transaction for your Swan vault with a BitBox02 Nova Bitcoin-only. Follow these steps.

- **Close the BitBoxApp first.** If the BitBoxApp and SVRA use the BitBox02 at the same time, signing can fail midway.
- **Connect one signing device at a time.** While a BitBox02 or a Trezor Safe 7 is connected, SVRA lists only these devices. Unplug the BitBox02 before you connect the next device.
- **Compare the pairing code.** On every run, SVRA shows a pairing code and the BitBox02 shows one too. If the two codes are the same, confirm on the BitBox02. If they are different, do not confirm. Unplug the BitBox02. SVRA stores no pairing data, so you do this on every run.
- **Check each key if the BitBox02 does not know your vault yet.** This is normal after a reset, or on a new BitBox02. The BitBox02 then shows each key of your vault. Check each key against the wallet configuration on your Swan Vault Recovery Sheet, then confirm on the BitBox02.
- **Stop if the BitBox02 should know your vault.** If your BitBox02 was not reset and you signed with it before, it already knows your vault. If it asks you to check keys anyway, the wallet configuration you pasted may not be your vault. Unplug the BitBox02 and check the wallet configuration against your Swan Vault Recovery Sheet.
- **Check the address and the amount** on the BitBox02 before you confirm the transaction.
- **To stop a session that waits for the BitBox02, unplug the BitBox02.** You cannot cancel the password prompt on the device. Plug the BitBox02 in again when you want to try again.

If your BitBox02 already holds a different wallet named `swan_vault`, SVRA adds your vault under the name `swan_vault_` followed by 8 characters, and tells you. This is normal only if you used this BitBox02 for another Swan vault. If you did not, stop and check the wallet configuration against your Swan Vault Recovery Sheet.

## Linux: allow access to the BitBox02

On Linux, a normal user cannot open the BitBox02 until you add a udev rule. (udev is the part of Linux that decides who may use a USB device.) If SVRA says that it found your BitBox02 but cannot open it, add this rule. BitBox publishes it in the [bitbox-bridge repository](https://github.com/BitBoxSwiss/bitbox-bridge/blob/63385207a0fb37f9bd7f0ff351214981a9b76d75/bitbox-bridge/release/linux/hid-digitalbitbox.rules). The two lines below apply to the BitBox02 (USB ID `03eb:2403`). The vendor's file also holds rules for the older BitBox01. You do not need them.

Save the rule, reload udev, then unplug the BitBox02 and plug it in again:

```bash
sudo tee /etc/udev/rules.d/50-bitbox02.rules > /dev/null <<'EOF'
SUBSYSTEM=="usb", ATTRS{idVendor}=="03eb", ATTRS{idProduct}=="2403", TAG+="uaccess", TAG+="udev-acl", MODE="0660", GROUP="bitbox", SYMLINK+="bitbox02-%n"
KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="03eb", ATTRS{idProduct}=="2403", TAG+="uaccess", TAG+="udev-acl", MODE="0660", GROUP="bitbox", SYMLINK+="bitbox02-f%n"
EOF
sudo udevadm control --reload-rules
sudo udevadm trigger
```

# Using a Trezor Safe 7

You can sign a transaction for your Swan vault with a Trezor Safe 7. Follow these steps.

- **Close Trezor Suite first.** Only one program can use the Trezor Safe 7 at a time. If Trezor Suite and SVRA use it together, signing fails.
- **Connect one signing device at a time.** While a Trezor Safe 7 or a BitBox02 is connected, SVRA lists only these devices and does not list other devices, such as a Jade. If more than one of them is connected, SVRA asks you to unplug all but one. Unplug the Trezor before you connect the next device.
- **Use the Trezor that you set up for your vault.** SVRA does not check that a Trezor is a genuine device.
- **Confirm the pairing on the Trezor.** In English, the Trezor asks: "Allow Swan Vault Recovery Assistant on this computer to pair with this Trezor?" The Trezor shows the question in the language that you chose on it. Confirm on the Trezor.
- **Type the 6-digit code into SVRA on every run.** The Trezor shows a 6-digit code. Type it into SVRA. The code proves that SVRA talks to this Trezor and that nothing sits in between. SVRA stores no pairing data, so it asks for a code on every run. Type only the 6 digits. If you paste more digits, SVRA keeps the first six. If you type a wrong code, the session ends. Start again.
- **Enter your passphrase on the Trezor if it asks.** You never type the passphrase into SVRA. SVRA first opens the standard wallet (the one without a passphrase). If your Trezor uses a passphrase, and the standard wallet holds no key of your vault, SVRA asks you to enter the passphrase on the Trezor. A Trezor that always asks for the passphrase on the device asks at once. The key of your vault can be in the standard wallet or in a passphrase wallet. If your Trezor always asks for the passphrase and the key of your vault is in the standard wallet, confirm an empty passphrase.
- **Know what the Trezor can check.** The Trezor Safe 7 stores no vault. SVRA sends the three keys of your vault with every signing request, and the Trezor checks only that its own key is one of them. The Trezor does not show these keys, and it gives no multisig warning. It cannot tell you that the keys are the right ones. So paste the wallet configuration only from your Swan Vault Recovery Sheet. If SVRA says that the Trezor refuses the key path of the wallet configuration, check that the configuration is the one from your Recovery Sheet. Check also that the network that you selected in SVRA is the network of your vault.
- **Check every address, every amount and the fee** on the Trezor before you sign. The Trezor shows every output of the transaction as a recipient, with its address and its amount. It shows an output that returns to your vault too. Then it shows the total with the fee. If the Trezor shows an address that you do not expect, do not confirm. If all are right, hold the "Hold to sign" button. These screens are the check that is left. SVRA refuses a transaction with an output to a vault address at an address index above 9,999, because a wallet may not find such an output again.
- **To stop, select Cancel at the code step, or unplug the Trezor at any step.** The code step also ends when you cancel the pairing on the Trezor. A step that waits for you ends after ten minutes. The Trezor can end a step sooner: it locks itself after a while without a touch, and that ends the step as a cancel. Plug the Trezor in again when you want to try again.

## Linux: allow access to the Trezor Safe 7

On Linux, a normal user cannot open the Trezor Safe 7 until a udev rule allows it. (udev is the part of Linux that decides who may use a USB device.) You do not need this step if Trezor Suite's udev rules are installed. Trezor Suite writes them to `/etc/udev/rules.d/51-trezor.rules`. If SVRA says that it found your Trezor but cannot open it, and Trezor Suite is closed, add this rule. The rule is from Trezor's own file [`51-trezor.rules`](https://data.trezor.io/udev/51-trezor.rules). The two lines below are the lines of that file for USB ID `1209:53c1` and `1209:53c0` (the same models in bootloader mode). `1209:53c1` is the ID of every current Trezor model, not only of the Safe 7, so the rule applies to them all. The file also holds rules for older Trezor models and for the `hidraw` interface. SVRA opens the Trezor Safe 7 through USB directly, so you do not need those rules.

The command below writes its own file, `51-svra-trezor.rules`. It does not change `51-trezor.rules`. Save the rule, reload udev, then unplug the Trezor and plug it in again:

```bash
sudo tee /etc/udev/rules.d/51-svra-trezor.rules > /dev/null <<'EOF'
SUBSYSTEM=="usb", ATTR{idVendor}=="1209", ATTR{idProduct}=="53c0", MODE="0660", GROUP="plugdev", TAG+="uaccess", TAG+="udev-acl", SYMLINK+="trezor%n"
SUBSYSTEM=="usb", ATTR{idVendor}=="1209", ATTR{idProduct}=="53c1", MODE="0660", GROUP="plugdev", TAG+="uaccess", TAG+="udev-acl", SYMLINK+="trezor%n"
EOF
sudo udevadm control --reload-rules
sudo udevadm trigger
```

# Verifying Your Download

When you download software that handles Bitcoin, you are trusting that software with access to your funds. A malicious or tampered binary could modify transaction outputs or compromise your security in ways that are difficult to detect.

**Don't trust, verify.**

This principle, central to Bitcoin itself, applies equally to the software you use. Verification allows you to independently confirm that:

1. **The binary you downloaded is authentic** - It was actually built and released by Swan, not by an attacker who compromised a download mirror or performed a man-in-the-middle attack.

2. **The binary matches the source code** - The executable was built from the exact source code in this repository, not from modified code with hidden malware.

3. **The build process was not tampered with** - The binary was produced by GitHub's secure build infrastructure, with a cryptographic chain of custody from source to release.

## Official Download Source

Swan distributes Swan Vault Recovery Assistant **exclusively** through official GitHub releases:

**https://github.com/swan-bitcoin/swan-vault-recovery-assistant/releases**

You should **always**:

- Download binaries only from the official GitHub releases page linked above
- Verify the build attestation before installing or running the binary
- Be suspicious of binaries obtained from any other source, including links in emails, social media, or third-party websites

## Quick Verification

After downloading a release, verify its authenticity using the [GitHub CLI](https://cli.github.com/):

```
# Verify build attestation (essential)
gh attestation verify <filename> --repo swan-bitcoin/swan-vault-recovery-assistant

# Verify release asset (recommended)
gh release verify-asset <filename> --repo swan-bitcoin/swan-vault-recovery-assistant
```

For example, to verify a Windows installer:

```
# Verify build attestation (essential)
gh attestation verify swan-vault-recovery-assistant_1.0.0_x64-setup.exe --repo swan-bitcoin/swan-vault-recovery-assistant

# Verify release asset (recommended)
gh release verify-asset swan-vault-recovery-assistant_1.0.0_x64-setup.exe --repo swan-bitcoin/swan-vault-recovery-assistant
```

Build attestation verification is the essential step that cryptographically proves the binary was built by GitHub Actions from this repository. Release asset verification provides additional assurance. **If either verification fails, do not use the binary.**

For detailed verification instructions, examples for other operating systems, how to verify without a GitHub account, or to learn more about this process, see the [full verification guide](docs/verifying-releases.md).

# For Developers

This section is intended for developers who want to review the code or contribute to the project. If you are looking to use the application, you can [download the latest release](https://github.com/swan-bitcoin/swan-vault-recovery-assistant/releases).

## Core Design Principles

In order to best protect the user's privacy and security, SVRA is designed with the following core principles:

1. **Zero Data Persistence**: SVRA must not persist any data to disk under any circumstances.
2. **Minimal Attack Surface**: SVRA must use a minimal dependency footprint so it may easily be audited.
3. **Open Source Transparency**: SVRA is free to use or extend (MIT license).

## Additional Design Principles

1. The rust backend must be completely stateless.
2. The frontend maintains state only in DOM components; a user is always able to visually confirm what data is being used.

## Device Support

SVRA uses [bitcoin-core's open-source HWI interface](https://github.com/bitcoin-core/HWI) for device enumeration and signing transactions (PSBTs), with two exceptions: the BitBox02 and the Trezor Safe 7 (see below).

HWI provides broad device support. However, only Jade devices are officially supported. The BitBox02 Nova Bitcoin-only is supported for Swan Vault recovery. The Trezor Safe 7 is supported for Swan Vault recovery.

SVRA has been tested with:

- Jade
- Jade Plus
- Coldcard MK4
- Coldcard Q
- Trezor

### BitBox02

SVRA can sign a Swan Vault recovery with a BitBox02 Nova Bitcoin-only. The automated tests sign against the vendor's firmware simulator (GitHub Actions: firmware 9.26.5, Multi edition; also run locally on 9.27.0). A run on a physical BitBox02 Nova is still to be done. For how to use it, see [Using a BitBox02](#using-a-bitbox02). It differs from Jade in these ways:

- SVRA talks to the BitBox02 directly with the vendor's open-source [`bitbox-api`](https://github.com/BitBoxSwiss/bitbox-api-rs) library. It does not use HWI for a BitBox02, because HWI cannot sign the key order of a Swan Vault. While a BitBox02 is on USB, SVRA does not call HWI `enumerate`, because HWI would open the device and start its own session.
- BitBox02 support adds the vendor's `bitbox-api` library and what it needs: USB HID access, the Noise encrypted channel and protobuf messages.
- A BitBox02 signs only for a wallet policy that it has registered. SVRA sends the policy `wsh(multi(2,@0/**,@1/**,@2/**))` with the keys in the order of the descriptor, as the Swan webapp does. It checks whether the BitBox02 holds that registration and registers it when it does not, for example after a reset. The BitBox02 identifies a registration by a hash of the coin, the policy and the keys, not by its name. The name is normally `swan_vault`. If the BitBox02 already holds another wallet named `swan_vault`, SVRA registers this wallet as `swan_vault_` followed by 8 characters, and tells you.
- With a BitBox02, SVRA signs only Swan Vault descriptors (unsorted `wsh(multi(...))`). Other wallets, such as single-key wallets or `sortedmulti`, are not supported.
- SVRA stores no pairing data, because it must not write to disk. The user confirms the pairing code on every run.
- The BitBox02 needs firmware 9.15.0 or newer. SVRA does not block other BitBox02 models, but it has not been tested with them.
- On a test network (testnet, signet or regtest), the BitBox02 shows testnet-format addresses.

### Trezor Safe 7

SVRA can sign a Swan Vault recovery with a Trezor Safe 7. The automated tests sign against Trezor's firmware emulator (firmware 2.13.1) and against a software device. No physical Trezor Safe 7 has signed with this build yet. For how to use it, see [Using a Trezor Safe 7](#using-a-trezor-safe-7). It differs from Jade in these ways:

- SVRA talks to the Trezor Safe 7 directly with Trezor's open-source [`trezor-thp`](https://crates.io/crates/trezor-thp) library. It does not use HWI for a Trezor Safe 7, because HWI 3.2.0 cannot speak the Trezor Host Protocol (THP). THP is the encrypted protocol that a Trezor Safe 7 uses. While a Trezor Safe 7 is on USB, SVRA does not call HWI `enumerate`, because HWI would send the older protocol to it.
- Other Trezor models still go through HWI, as before. They are not officially supported.
- The Trezor Safe 7 shows a 6-digit pairing code, and the user types it into SVRA on every run. SVRA stores no pairing data, because it must not write to disk.
- The Trezor Safe 7 stores no vault, so there is no registration step. Every signing request carries the three keys of the vault in the order of the descriptor, and the device checks only that its own key is one of them. The device cannot tell the user that the keys are the right ones. SVRA reads the key of the device, compares it with the vault, and checks every signature that the device returns before it hands the transaction back.
- With a Trezor Safe 7, SVRA signs only Swan Vault descriptors (unsorted `wsh(multi(...))`). Other wallets are not supported.
- SVRA first opens the standard wallet of the device. If the passphrase is on and that wallet holds no key of the vault, SVRA opens a second wallet session. The user enters the passphrase on the device. A device that always asks for the passphrase asks at once.
- SVRA does not check that the Trezor is a genuine device. A device that is not genuine can show a pairing code and pass the pairing. It can sign only if it holds a key of the vault.
- SVRA sends every output of the transaction to the Trezor as a payment to an address. So the Trezor shows each output as a recipient, also an output that returns to the vault. The Trezor does not treat any output as change, so it shows each one.
- SVRA refuses a transaction with an output to a vault address at an address index above 9,999, because a wallet may not find such an output again. This check runs for the BitBox02 too.
- The Trezor Safe 7 needs firmware 2.9.3 or newer.
- Trezor Safe 7 support adds Trezor's `trezor-thp` library and what it needs: USB access through `nusb` (pure Rust, so it needs no `libudev`), the Noise encrypted channel (`trezor-noise-rust-crypto`) and protobuf messages (`prost`). It also adds a crate of the SVRA workspace, `svra_vault`, which holds the descriptor and transaction checks that the BitBox02 code shares with the Trezor code.

## Setup Instructions

### Prereqs

1. Verify you have rust installed

```bash
$ rustc --version
rustc 1.80.0 (051478957 2024-07-21)
```

to install, visit [rustup.rs](http://rustup.rs) or run the following command (linux, mac, WSL):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

to update:

```bash
rustup update
```

2. this repo uses `pnpm` for managing packages. The required version is pinned via `packageManager` in `package.json` and enforced by [corepack](https://nodejs.org/api/corepack.html); enable corepack with `corepack enable` if your Node install doesn't already include it. Otherwise you can [install pnpm manually](https://pnpm.io/installation).

3. Install git hooks (one-time after clone). The `prepare` script no longer runs automatically — `.npmrc` sets `ignore-scripts=true` to block install-time RCE from compromised dependencies, which also disables this project's own lifecycle scripts. Run:

   ```bash
   pnpm exec husky
   ```

4. HWI must be installed on your system to use any of the external device features (device enumeration and PSBT signing). This can be present in your PATH or in the `src-tauri` directory. Fetch it explicitly with `pnpm run fetch:hwi` — this was previously automatic via a `postinstall` script, but is now an explicit step (same supply-chain reason as the hooks above). The [fetch script](./scripts/fetch-hwi.ts) SHA-256 verifies the downloaded binary against a checksum pinned in [`scripts/hwi.json`](./scripts/hwi.json). You may also choose to download the HWI binaries yourself from [bitcoin-core/HWI](https://github.com/bitcoin-core/HWI/releases).

#### Updating the HWI version

To bump the pinned HWI version, run:

```bash
./scripts/bump-hwi.sh <new-version>
```

This downloads the `SHA256SUMS.txt.asc` file from the HWI release, verifies its GPG signature against the [HWI signing key](https://github.com/achow101) (`152812300785C96444D3334D17565732E08E5E41`), and writes the verified checksums into `scripts/hwi.json`. The build script (`scripts/fetch-hwi.ts`) reads from this file — it does not need GPG itself.

Prerequisites for the bump script: `gpg`, `jq`, and `curl`.

4. other system dependencies

linux systems need these packages

```bash
apt-get update && apt-get install -y build-essential curl wget file libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libudev-dev
```

`libudev-dev` is needed to build the BitBox02 USB code. The Trezor Safe 7 USB code needs no extra package.

### Run the application

1. checkout this repo and cd into it

```bash
$ git clone https://github.com/swan-bitcoin/swan-vault-recovery-assistant.git
$ cd swan-vault-recovery-assistant
```

2. install the frontend requirements

```bash
$ pnpm install
```

3. run tauri in dev mode:

```bash
(venv) $ pnpm tauri dev
```

## Testing

Verify you have docker installed (required for all but unit tests)

```bash
$ docker -v
Docker version 24.0.7, build 24.0.7
```

### Automated testing

`pnpm test` will run both the unit and scenario tests. The scenario tests have further requirements (see below). run `pnpm test:unit` for unit tests only.

#### Scenario tests

To run the scenario tests, you'll need the tauri driver and the webkit driver. The common linux steps are below as of this writing; refer to [this guide for the latest steps](https://jonaskruckenberg.github.io/tauri-docs-wip/development/testing.html#prerequisites) for both linux and windows. MacOS is not currently supported.

```bash
sudo apt install webkit2gtk-driver
cargo install tauri-driver
```

#### BitBox02 tests

The BitBox02 device code is the crate `src-tauri/bitbox02` (`svra_bitbox02`). It has no Tauri dependency. Run its tests from `src-tauri`.

Plain `cargo test -p svra_bitbox02` runs neither the USB tests nor the simulator tests. The USB tests need `--features usb`, which needs `libudev-dev` on Linux. The simulator tests sign against the vendor's firmware simulator. They need `--features simulator` and the `BITBOX02_SIMULATOR` variable, set to the path of the simulator binary.

The simulator is a Linux x86-64 binary that the vendor publishes with each firmware release. The pinned download URL and SHA-256 are the `BITBOX02_SIMULATOR_URL` and `BITBOX02_SIMULATOR_SHA256` values in [`.github/workflows/test.yml`](.github/workflows/test.yml). That file is the place that is kept up to date. The snippet below repeats the current values:

```bash
BITBOX02_SIMULATOR_URL=https://github.com/BitBoxSwiss/bitbox02-firmware/releases/download/firmware%2Fv9.26.5/bitbox02-multi-v9.26.5-simulator1.0.0-linux-amd64
BITBOX02_SIMULATOR_SHA256=21a394c3d7642e0a251b340fba9b601742ae98c3790e439b6258b55e1a4585bf

curl -fsSL -o bitbox02-simulator "$BITBOX02_SIMULATOR_URL"
echo "$BITBOX02_SIMULATOR_SHA256  bitbox02-simulator" | sha256sum -c -
chmod +x bitbox02-simulator

BITBOX02_SIMULATOR="$PWD/bitbox02-simulator" cargo test -p svra_bitbox02 --features usb,simulator
```

#### Trezor tests

The Trezor device code is the crate `src-tauri/trezor` (`svra_trezor`). The descriptor and transaction checks that it shares with the BitBox02 code are in the crate `src-tauri/vault` (`svra_vault`). Neither has a Tauri dependency. Run their tests from `src-tauri`:

```bash
cargo test -p svra_vault
cargo test -p svra_trezor --features usb
```

The emulator tests sign against Trezor's Safe 7 firmware emulator, and they need Trezor's model of the Tropic01 secure element next to it. They run only when the variable `TREZOR_EMULATOR` holds the path of the emulator. Without it, they skip and the run still passes. When the variable `TREZOR_EMULATOR_REQUIRED` is set, a missing emulator fails the tests instead. The CI job sets it. When `TREZOR_EMULATOR` is set, `TREZOR_TROPIC_MODEL_SERVER` (the model server) and `TREZOR_TROPIC_MODEL_CONFIG` (its config file) must be set too. Each test starts its own model server and emulator.

The setup is long, so it is not repeated here. The job `trezor tests` in [`.github/workflows/test.yml`](.github/workflows/test.yml) holds the steps and the pinned downloads, for Linux on x86-64. The folder [`src-tauri/trezor/tests/emulator-rig`](src-tauri/trezor/tests/emulator-rig) holds the other two pins and explains how to update them. The job also checks that the emulator tests ran.

The hand-over of the pairing code from the page to the session is a type in `svra_trezor`, so `cargo test -p svra_trezor` covers it. The app has unit tests for the rest of the Trezor glue. They need the Tauri build dependencies. Run `cargo test -p swan_vault_recovery_assistant --bin swan_vault_recovery_assistant` from `src-tauri`. The Tauri build needs the `hwi` file in `src-tauri` (see the HWI step above). CI does not run these tests, because a cold build of Tauri would add several minutes to a job.

### Manual testing with a simulated 'regtest' bitcoin network

A network simulation script is provided in the `/test` directory. It can be ran with

```bash
$ pnpm simnet
```

The script will automatically initialize the `docker compose` stack and bring the bitcoin network up to a healthy state for sending transactions and estimating fees. The script may take up to a minute to prepare the network the first time it is run.

The `~~ NETWORK READY ~~` message will be printed when the setup is done. A couple of wallet descriptors will be generated above this message; one funded wallet and one unfunded wallet. The funded wallet's mnemonic will be printed as well so you can test with any PSBT signing software or a physical hardware device. Make sure the hardware device is initialized in test mode and DO NOT USE THIS MNEMONIC WITH A REAL BITCOIN WALLET!

If you would like to reset the network (destroying all blocks/transactions in the process), simply run `docker compose down` when the simnet script is not running.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Troubleshooting

Review the [prerequisites page of Tauri](https://tauri.app/v1/guides/getting-started/prerequisites/) and verify you have the proper system dependencies installed.

### Error: failed to run custom build command for `javascriptcore-rs-sys v1.1.1`

As of 08/13/2024, (upgrade to Tauri 2.0-rc3), the dependency list is out of date. Install additional dependencies (linux):

```bash
sudo apt-get update && sudo apt-get install javascriptcoregtk-4.1 libsoup-3.0 webkit2gtk-4.1 -y
```

## Pull Request Labels

If modifying the bundling process, verify on all platforms by adding the `all
bundles` label to your pull request. Otherwise CI will only bundle the MAC
bundle (because its fastest) to check the release build.

## Committed front-end build outputs

Because SVRA has a moderately complex front-end build pipeline that
transforms its TypeScript and CSS before execution in the application, we
commit the resulting compiled JavaScript and CSS files for anyone to audit the
behavior of the application without having to audit the build pipeline itself.

When you modify TypeScript or CSS files, the pre-commit hook automatically runs `pnpm build` and stages the updated dist files. To preview build output before committing, run `pnpm build` manually.

## Releasing

This project uses a streamlined, tag-driven release process with automatically generated release notes.

### Developer Workflow: Pull Requests

To ensure high-quality release notes, it is mandatory for all pull requests to have a clear and descriptive title. The automated release process uses these PR titles to build the changelog for each release.

### Creating a New Release

1.  **Create a Release Branch**: From an up-to-date `master` branch, create a branch for the release preparation.

    ```bash
    git checkout master
    git pull origin master
    git checkout -b release-preparation
    ```

2.  **Bump and Sync Versions**: Run the `sync-versions.ts` script with the desired bump type (`patch`, `minor`, or `major`). This command updates all necessary version files.

    ```bash
    pnpm sync-versions patch
    ```

3.  **Commit the Version Bump**: Add and commit all the file changes with a descriptive message. Note the new version number for a later step.

    ```bash
    git add .
    git commit -m "Release v0.2.0"
    ```

4.  **Push the Branch**: Push _only the branch_ to GitHub to begin the review process. **Do not push any tags yet.**

    ```bash
    git push origin release-preparation
    ```

5.  **Create and Merge Pull Request**: Create a pull request from `release-preparation` to `master`. Once it has been reviewed and approved, merge it.

6.  **Tag `master` and Push the Tag**: After the pull request is merged, update your local `master` branch. Then, create a tag on the new merge commit and push the tag to GitHub. This is the final step that triggers the automated release.

    ```bash
    git checkout master
    git pull origin master
    git tag v0.2.0
    git push origin v0.2.0
    ```

7.  **Approve and Monitor**: Pushing the tag to `master` triggers the `build` workflow, which will pause for manual approval. Once approved, the workflow will automatically:
    - Build the application for all platforms.
    - Create a new GitHub Release with notes generated from all the PRs merged since the last release.
    - Upload all the compiled application files to the release.
