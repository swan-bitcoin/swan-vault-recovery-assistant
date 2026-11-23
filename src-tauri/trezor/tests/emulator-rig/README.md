# Emulator rig data

These two files are inputs for the `trezor-test` job in `.github/workflows/test.yml`. That job runs
Trezor's Safe 7 firmware emulator and the model of the Tropic01 secure element that the emulator
needs. Nothing in this folder is code. The job checks every download against a pin, and these files
hold two of the pins.

## `model-server-requirements.txt`

The Python packages of the Tropic model server (`ts-tvl`, package `tvl`), pinned by version and by
the SHA-256 of every wheel and source archive. The job installs them with `pip --require-hashes`.

How it was made: take `poetry.lock` of `ts-tvl` at the commit that the firmware release uses
(`vendor/ts-tvl` of `trezor-firmware` tag `core/v2.13.1`: commit
`c28a7d8865866baf442d53e01559e6d3fa87b9e4`). Keep the packages of the `main` group, resolve the
markers for CPython 3.10 on Linux, and list the hash of every file of each release. `crcmod` 1.7 and
`tvl` itself are not in the file. The workflow installs them with their own pins (a hash for
`crcmod`, a git commit for `tvl`).

The versions were run on CPython 3.10. The job uses Ubuntu 24.04 with CPython 3.12. Every pinned
package has a wheel for CPython 3.12 on x86-64. A package that a newer Python needs and the file
lacks makes `pip` fail. It does not install a version that nobody checked.

## `nix-closure-x86_64.txt`

The libraries of the x86-64 emulator binary: 286 paths of the Nix store, with their hashes. The
emulator is a Nix build. Its ELF interpreter and its libraries are at fixed `/nix/store/...` paths,
so the job puts exactly these paths there.

Each line is `sha256:<NAR hash in Nix base 32> <NAR size> /nix/store/<path>`, sorted by path. The job
fetches the paths with `nix-store --realise` (Nix checks the signature of `cache.nixos.org`) and
writes the closure as a list in this same format (`nix-store --query --requisites`, `--hash` and
`--size`). The `nixos/nix` image has only Nix and coreutils, so the runner compares that list with
this file using `diff`, before anything goes into `/nix/store`. The job fails if the set of paths
differs or if one NAR hash differs, and it prints the first lines of both lists and the diff.

How it was made: the closure of five root paths. The binary names them. `readelf -d <emulator>`
shows the `RUNPATH`, and `readelf -l <emulator>` shows the interpreter. Walk the `References:` of the
`.narinfo` file of each path on `cache.nixos.org`, and write the `NarHash` and `NarSize` of each path.
This script does it. Run it with the root paths as arguments:

```bash
#!/bin/bash
set -euo pipefail
seen=$(mktemp -d)
queue=("$@")
while [ "${#queue[@]}" -gt 0 ]; do
  path=${queue[0]}
  queue=("${queue[@]:1}")
  name=${path#/nix/store/}
  [ -e "$seen/$name" ] && continue
  info=$(curl -fsSL "https://cache.nixos.org/${name%%-*}.narinfo")
  hash=$(sed -n 's/^NarHash: //p' <<<"$info")
  size=$(sed -n 's/^NarSize: //p' <<<"$info")
  echo "$hash $size /nix/store/$name" >"$seen/$name"
  for ref in $(sed -n 's/^References: //p' <<<"$info"); do
    [ "$ref" = "$name" ] || queue+=("/nix/store/$ref")
  done
done
sort -k3 "$seen"/*
rm -rf "$seen"
```

The five roots of emulator 2.13.1 (x86-64) are `libjpeg-turbo-3.1.4.1`, `sdl3-3.4.16-lib`,
`sdl3-image-3.4.8-lib`, `openssl-3.5.8` and `glibc-2.44-25`. The workflow lists their full paths.
When the script ran with these five roots, it wrote this file again, byte for byte.

## Update the pins when the emulator version changes

1. Take the x86-64 emulator of the new release. The current one is
   `https://data.trezor.io/dev/firmware/releases/emulators-new/T3W1/trezor-emu-core-T3W1-v2.13.1`.
   The arm64 build has the suffix `-arm`. Download the file, and put its URL and its SHA-256 in
   `TREZOR_EMULATOR_URL` and `TREZOR_EMULATOR_SHA256` in the workflow.
2. Read the five new roots from the binary (`readelf`, see above). Put them in the step
   `fetch the emulator libraries into /nix/store` of the workflow. Run the script and replace
   `nix-closure-x86_64.txt` with its output.
3. Find the `ts-tvl` commit of the new firmware tag (`vendor/ts-tvl`). Put it in `TVL_COMMIT`.
   Take its `poetry.lock`, build `model-server-requirements.txt` as described above, and check
   that `tvl` still needs the same `crcmod` file.
4. Set `TROPIC_MODEL_CONFIG_URL` to the file `tests/tropic_model/firmware_config/current.yml` at the
   new firmware tag, and put its SHA-256 in `TROPIC_MODEL_CONFIG_SHA256`.
5. Run the job. Then update the firmware version that `README.md` of the repository names as
   tested.

When the Nix image changes, take the digest of the new image index from Docker Hub and put it in
`NIX_IMAGE`. The image is only a tool that copies the libraries, so any recent `nixos/nix` image
works.
