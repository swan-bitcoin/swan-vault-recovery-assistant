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
```

3. install the frontend requirements

```bash
$ pnpm install
```

4. run tauri in dev mode:

```bash
$ pnpm tauri dev
```

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
