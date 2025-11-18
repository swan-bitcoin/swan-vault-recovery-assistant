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

Swan Vault Recovery Assistant can import any wallet that supports exporting its configuration as output descriptors, including Swan Vault and many modern Bitcoin wallets. For signing transactions, Blockstream Jade is officially supported for use with Swan Vault Recovery Assistant.

> Does Swan Vault Recovery Assistant collect any data?

Swan Vault Recovery Assistant does not collect any data. However, to display your balance and transaction history, it scans the blockchain through a server. As a result, this server will learn which Bitcoin addresses are associated with your IP address. While this affects privacy, it does not compromise security, since the server cannot access your keys or authorize transactions. By default, Swan Vault Recovery Assistant connects to Blockstream’s server due to its strong reputation, but advanced users can choose a different server or run their own to improve privacy.

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

SVRA uses [bitcoin-core's open-source HWI interface](https://github.com/bitcoin-core/HWI) for device enumeration and signing transactions (PSBTs).

HWI provides broad device support. However, only Jade devices are officially supported.

SVRA has been tested with:

- Jade
- Jade Plus
- Coldcard MK4
- Coldcard Q
- Trezor

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

2. this repo uses `pnpm` for managing packages. You may need to [install it](https://pnpm.io/installation)

3. HWI must be installed on your system to use any of the external device features (device enumeration and PSBT signing). This can be present in your PATH or in the `src-tauri` directory. It will be [downloaded automatically](./scripts/fetch-hwi.ts) when using `pnpm install` for the first time from a copy of this repository. You may also choose to download the HWI binaries yourself from [HWI's github releases page](https://github.com/bitcoin-core/HWI/releases) -- this project was last verified against v3.1.0 on 10/16/2024.

4. other system dependencies

linux systems need these packages

```bash
apt-get update && apt-get install -y build-essential curl wget file libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

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

## Releasing

This project uses a fully automated release process triggered by a tag push.

1.  **Create Temporary Branch**: From an up-to-date `master` branch, create a temporary branch to prepare the release.

    ```bash
    git checkout master
    git pull origin master
    git checkout -b prep-release
    ```

2.  **Update Changelog**: Determine what the next version number will be based on the changes. Add a new section for this version to the `CHANGELOG.md` file with your release notes.

    > The CI process will verify that the `CHANGELOG.md` file contains a markdown heading corresponding to the version tag (e.g., `## [0.2.1]`). This ensures that every release is documented. Following a format like the one suggested by [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) is recommended.

3.  **Commit Changelog**: Commit the updated `CHANGELOG.md` file.

    ```bash
    git add CHANGELOG.md
    git commit -m "docs: prepare changelog for next release"
    ```

4.  **Bump Version**: On the `prep-release` branch, run the `pnpm version` command that corresponds to the changes you made. This will create a second commit for the version bump and a local version tag.

    ```bash
    # For a patch release (e.g., 0.2.0 -> 0.2.1)
    pnpm version patch

    # For a minor release (e.g., 0.2.1 -> 0.3.0)
    pnpm version minor
    ```
    The command will output the new version tag (e.g., `v0.2.1`). Use this for the next step.

5.  **Rename Branch**: Rename the local branch to include the new version number for clarity.

    ```bash
    git branch -m release/<tag-name>
    # Example: git branch -m release/v0.2.1
    ```

6.  **Push Branch**: Push your newly named release branch to GitHub to begin the review process.

    ```bash
    git push origin release/<tag-name>
    # Example: git push origin release/v0.2.1
    ```

7.  **Create and Merge Pull Request**: Create a pull request from your release branch to `master`. It will contain two commits: one for the changelog and one for the version bump. Once reviewed and approved, merge it.

8.  **Push the Tag**: After the pull request is merged, push the tag that was created locally in step 4. This is the final step that kicks off the automated release.

    ```bash
    git push origin <tag-name>
    # Example: git push origin v0.2.1
    ```
    *Note: If your local tag points to the wrong commit (e.g., if `master` was updated while your PR was open), you may need to move it. After pulling the latest `master`, run `git tag -f <tag-name>` to move the tag to the merge commit, then `git push -f origin <tag-name>` to update it on the remote.*

9.  **Approve the Build**: Pushing the tag triggers the `build` workflow, which will immediately pause and wait for manual approval from a designated reviewer in the GitHub Actions UI.

10. **Done!**: Once the build is approved, the workflow will automatically:
    - Build the application for all platforms.
    - Create a new GitHub Release corresponding to your tag.
    - Upload all the compiled application files to the release.
    You can monitor the progress in the "Actions" tab on GitHub.
