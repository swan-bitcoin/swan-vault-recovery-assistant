# Tempura

Tempura is the world's simplest bitcoin wallet. It is a stateless native desktop application that forgets everything when you're done using it. It works with any wallet descriptor. Did I mention it forgets everything? No breadcrumbs to worry about. What was I talking about?

Want to test your recovery path? Tempura won't tell.  
Want to independently verify your balance? Tempura doesn't care.  
Need to recover your funds from another wallet? Tempura can help.

## Design Principles

1. Tempura must not persist any data to disk under any circumstances.
2. Tempura must use a minimal dependency footprint so it may easily be audited.
3. Tempura is free to use or extend (MIT license).

## Setup Instructions for Developers

### Prereqs

1. Verify you have rust installed

```bash
$ rustc --version
rustc 1.80.0 (051478957 2024-07-21)
```

to install:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

to update:

```bash
rustup update
```

2. this repo uses `pnpm` for managing packages. You may need to [install it](https://pnpm.io/installation)

3. Other system packages

install all requirements required by [rust-hwi](https://github.com/bitcoindevkit/rust-hwi?tab=readme-ov-file#prerequisites)

this is probably

```bash
sudo apt install libusb-1.0-0-dev libudev-dev python3-dev
```

### run the application

1. checkout this repo and cd into it
2. create a python virtual environment and activate it (required for `rust-hwi` python dependencies)

```bash
$ python -m venv venv
$ source venv/bin/activate
(venv) $ pip install -r requirements.txt
```

3. install the frontend requirements

```bash
(venv) $ pnpm install
```

4. run tauri in dev mode:

```bash
(venv) $ pnpm tauri dev
```

## A special note about requirements.txt and the bugs in HWI / rust-hwi

10/09/2024

once upon a time an unfortunate soul spent hours and hours diving into an HWI bug, found the bug, and went to go fix said bug. our hero discovered that the bug was fixed in the HWI repo already, but that the latest version of rust-hwi does not depend on a version of HWI which includes the fix.

the fix requires `hwi>3`, but as of writing `rust-hwi 0.10.0` relies on `hwi>=2.1.1,<3`

because of the way the python dependencies are loaded into memory when building in rust, and because of the way [pyo3](https://pyo3.rs/v0.22.3/) works (rust is compiled but python is interpreted), we can actually hax our own dependencies.

in other words, the `requirements.txt` file _should ideally_ be in sync with whatever actual python dependencies are expected by packages build with pyo3 (`rust-hwi`), but they are not.

this means that, until resolved, there are possibly/probably/maybe/most definitely unforeseen consequences of this dependency drift. buuuuuuuuuuut doesn't matter; had success.

### details of the bug

`enumerate` accepts optional parameters in HWI, but `rust-hwi` does not pass parameters to said function. `enumerate` works by opening a connection to the device which, in the case of Jade, logs in to the device with the default network of 'mainnet'- causing a device to fail if configured for test networks OR causing the device to _associate itself with mainnet permanently_ if not already configured to use a network.

even more fun, `find_device` calls `enumerate`, and does not pass along the parameters given to `find_device` in the version of the code required by `rust-hwi 0.10.0`. this is [fixed here](https://github.com/bitcoin-core/HWI/commit/27c1b4272a137af1dfd6f4fd12db2cc9143e0b16#diff-4d0306f471cc7cde69675cd46a4773976c0df89e0e48a9fe0b85693c9c4c4870R149) but is only included in HWI version 3.1 and up.

## Usage Instructions

Paste one or both descriptors in and hit 'Fetch Balance'. More features coming later.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Troubleshooting

review the [prerequisites page of Tauri](https://tauri.app/v1/guides/getting-started/prerequisites/) and verify you have the proper system dependencies installed.

### Error: failed to run custom build command for `javascriptcore-rs-sys v1.1.1`

As of 08/13/2024, (upgrade to Tauri 2.0-rc3), the dependency list is out of date. Install additional dependencies (linux):

```bash
sudo apt-get update && sudo apt-get install javascriptcoregtk-4.1 libsoup-3.0 webkit2gtk-4.1 -y
```
