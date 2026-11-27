# Emulator rig

This folder holds what the `trezor-test` job in `.github/workflows/test.yml` needs to run Trezor's Safe 7 firmware emulator, and the
model of the Tropic01 secure element that the emulator needs. The data files are pins: the job checks every download against a hash
or a commit, and these files hold some of them. The scripts make the data files again when the firmware version changes.

| File                                  | What it is                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------- |
| `model-server-requirements.txt`       | Python packages of the model server, with hashes. Made by the script below |
| `make-model-server-requirements.py`   | Makes `model-server-requirements.txt` from the `poetry.lock` of `ts-tvl`   |
| `nix-closure-x86_64.txt`              | The libraries of the emulator (Nix store paths, with hashes)               |
| `nix-closure.sh`                      | Makes `nix-closure-x86_64.txt`                                             |
| `check-proto.py`                      | Compares the hand-written protobuf messages with the firmware's `.proto`   |

## Where the emulator tests can run

- In CI, on Linux x86-64: the `trezor-test` job (`ubuntu-24.04`). This is the only place where they run on every push.
- On macOS and Windows: not at all. The emulator is a Linux executable that Trezor builds with Nix. The tests skip and print
  `skipped: TREZOR_EMULATOR is not set`.
- On Linux arm64: only with the arm64 build of the emulator (the same file name with the suffix `-arm`) and a closure list of its
  own, made with `nix-closure.sh` from the roots of that binary. This repository holds neither, so the job and this folder do not
  support it.
- The tests need three variables: `TREZOR_EMULATOR` (the emulator), `TREZOR_TROPIC_MODEL_SERVER` (the model server) and
  `TREZOR_TROPIC_MODEL_CONFIG` (its config file). Without `TREZOR_EMULATOR` the tests skip. With `TREZOR_EMULATOR_REQUIRED` set (CI
  does this) a missing emulator fails the test.
- A failing test keeps the folder with the emulator logs and prints its path: `The emulator logs are in <folder>`. The folder is in
  the system's temp directory and its name starts with `svra-trezor-emulator-`.

## Update the pins when the firmware version changes

Do the steps in this order. `TAG` is the firmware tag, for example `core/v2.13.2`.

1. Find the commits that the tag names. Both commands print one commit hash:

   ```bash
   TAG=core/v2.13.2
   # The commit of the tag. The config URL of the Tropic model needs it (step 5).
   gh api "repos/trezor/trezor-firmware/commits/$TAG" --jq .sha
   # The commit of ts-tvl that this firmware uses. This is `TVL_COMMIT` (step 4).
   gh api "repos/trezor/trezor-firmware/contents/vendor/ts-tvl?ref=$TAG" --jq .sha
   ```

2. Take the x86-64 emulator of the new release. The current one is
   `https://data.trezor.io/dev/firmware/releases/emulators-new/T3W1/trezor-emu-core-T3W1-v2.13.1`. Download it, take its hash with
   `sha256sum`, and put the URL and the hash in `TREZOR_EMULATOR_URL` and `TREZOR_EMULATOR_SHA256` in the workflow.
3. Update the libraries. The emulator is a Nix build, so its interpreter and its libraries are at fixed `/nix/store/...` paths.
   `readelf -d <emulator>` shows the `RUNPATH`, and `readelf -l <emulator>` shows the interpreter. Together they name five store
   paths (the roots). Put them in the step `fetch the emulator libraries into /nix/store` of the workflow, and make the list again:

   ```bash
   bash src-tauri/trezor/tests/emulator-rig/nix-closure.sh <root> <root> <root> <root> <root> \
     > src-tauri/trezor/tests/emulator-rig/nix-closure-x86_64.txt
   ```

   The script needs bash, curl, sed, sort and access to `cache.nixos.org`. It takes about one minute. The roots of emulator 2.13.1 are
   `libjpeg-turbo-3.1.4.1`, `sdl3-3.4.16-lib`, `sdl3-image-3.4.8-lib`, `openssl-3.5.8` and `glibc-2.44-25` (the workflow lists their
   full paths). With these five roots the script writes the checked-in file again, byte for byte.

4. Update the model server. Put the commit of step 1 in `TVL_COMMIT` in the workflow. Then make the requirements file again, with
   Python 3.11 or newer:

   ```bash
   git clone --filter=blob:none https://github.com/tropicsquare/ts-tvl /tmp/ts-tvl
   git -C /tmp/ts-tvl checkout <TVL_COMMIT>
   python3 -I src-tauri/trezor/tests/emulator-rig/make-model-server-requirements.py /tmp/ts-tvl/poetry.lock <TVL_COMMIT> \
     > src-tauri/trezor/tests/emulator-rig/model-server-requirements.txt
   ```

   The script stops with a message when `poetry.lock` has a marker that it does not know or two versions of a package. Extend it then.
   Check also that `crcmod` is still version 1.7 in `poetry.lock`. The script leaves `crcmod` out, and the workflow installs it from
   `CRCMOD_URL` with `CRCMOD_SHA256`. With the old commit (`c28a7d8865866baf442d53e01559e6d3fa87b9e4`) the script writes the
   checked-in file again, byte for byte.

   The packages were resolved for CPython 3.10. The job uses Ubuntu 24.04 with CPython 3.12. Every pinned package has a wheel for
   CPython 3.12 on x86-64, and the job installs with `--only-binary=:all:`. A package that Python 3.12 needs and the file lacks makes
   `pip` fail. It does not install a version that nobody checked.

5. Update the config of the Tropic model. Set `TROPIC_MODEL_CONFIG_URL` to
   `https://raw.githubusercontent.com/trezor/trezor-firmware/<commit of the tag>/tests/tropic_model/firmware_config/current.yml`, with
   the first commit of step 1. Take the hash of that file with `curl -fsSL <URL> | sha256sum` and put it in
   `TROPIC_MODEL_CONFIG_SHA256`.
6. Change the version in every place that names it. This command finds them (run it from the root of the repository):

   ```bash
   grep -rn '2\.13\.1' src-tauri/trezor README.md .github
   ```

   Today these are the module docs of `emulator.rs`, `proto.rs`, `usb.rs` (twice), `cpace.rs` and `test_device.rs`, the comments of the
   workflow and the sentence in `README.md` that names the tested firmware. `test_device.rs` also has the version that the software
   device reports (`Behavior::default`). It is a test value, and it does not have to follow the firmware.
7. Check the hand-written protobuf messages. `src/proto.rs` and the test messages at the top of `tests/emulator.rs` copy the messages
   of the firmware's `common/protob` folder. Fetch the six files of the new tag and run the checker. It needs Python 3.8 or newer:

   ```bash
   PROTO_DIR=$(mktemp -d)
   for f in messages messages-bitcoin messages-common messages-debug messages-management messages-thp; do
     gh api -H 'Accept: application/vnd.github.raw' \
       "repos/trezor/trezor-firmware/contents/common/protob/$f.proto?ref=$TAG" > "$PROTO_DIR/$f.proto"
   done
   cd src-tauri/trezor
   python3 -I tests/emulator-rig/check-proto.py "$PROTO_DIR" src/proto.rs tests/emulator.rs
   ```

   The last line is `OK <n> checked, 0 problems` when every field number, label and type, every enum value and every message type
   number is the one of the firmware. A line that starts with `NOTE` is not a problem. The checker does not read the comments of the
   `.proto` files, so also read the changes of the messages that SVRA sends.

8. Run the job. A failure in the emulator tests after a bump usually means new wording on a screen. The tests match these texts of
   the device:
   - `one-time security code` on the code screen (`is_code_screen`);
   - `pair with this` on the dialog that asks to allow the connection, and the app name and `this computer` in it;
   - `Recipient`, `Recipient #1` and `Amount <coins> TEST` on the screens of the recipients (`recipients`, `assert_recipient`);
   - `Confirm Locktime` and `Locktime set to blockheight` on the lock-time screen;
   - `Total amount` and `incl. Transaction fee` on the total screen (`assert_total`);
   - the layout names `TextScreen`, `PinKeyboard` and `StringKeyboard` in the loop of `Presser`.

   One branch of the crate depends on a text of the firmware: `device_error.rs` looks for `Forbidden key path` in a failure. The
   emulator test `a_network_that_does_not_fit_the_vault_is_a_forbidden_key_path` pins it. `usb.rs` names two facts that come from the
   firmware release (the interface and the endpoint of the Safe 7, and its USB strings). Read them again in the new release.
9. Update the sentence in `README.md` of the repository that names the tested firmware version.

When the Nix image changes, take the digest of the new image index from Docker Hub and put it in `NIX_IMAGE`. The image is only a
tool that copies the libraries, so any recent `nixos/nix` image works.

## Why `trezor-thp` and `trezor-noise-rust-crypto` are pinned with `=`

`Cargo.toml` pins `trezor-thp` and `trezor-noise-rust-crypto` to exact versions. `trezor-thp` is a 0.x protocol crate whose state
machine this crate drives, and `trezor-noise-rust-crypto` is the crypto backend that it is built against. A 0.x release of either
may change what they do, and `cargo update` must not do that by accident. Bump them by hand and only with a green `trezor-test` job,
because the emulator tests are the only check of the protocol against the real firmware (one firmware version: the one that this
folder pins).

## What the data files hold

### `model-server-requirements.txt`

The Python packages of the Tropic model server (`ts-tvl`, package `tvl`), pinned by version and by the SHA-256 of every wheel and
source archive. The job installs them with `pip --require-hashes`. `make-model-server-requirements.py` writes the whole file,
including its header. `crcmod` and `tvl` itself are not in it. The workflow installs them with their own pins: a hash for `crcmod`
and a git commit for `tvl`.

### `nix-closure-x86_64.txt`

The libraries of the x86-64 emulator binary: 286 paths of the Nix store, with their hashes. Each line is
`sha256:<NAR hash in Nix base 32> <NAR size> /nix/store/<path>`, sorted by path. The job fetches the paths with `nix-store --realise`
(Nix checks the signature of `cache.nixos.org`) and writes the closure as a list in this same format. The `nixos/nix` image has only
Nix and coreutils, so the runner compares that list with this file using `diff`, before anything goes into `/nix/store`. The job
fails if the set of paths differs or if one NAR hash differs, and it prints the first lines of both lists and the diff.
