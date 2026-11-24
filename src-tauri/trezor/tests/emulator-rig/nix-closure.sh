#!/usr/bin/env bash
# Writes the list that `nix-closure-x86_64.txt` holds: the Nix store paths that the Safe 7
# emulator needs, with their hashes and sizes.
#
# Usage: bash nix-closure.sh <store path>... > nix-closure-x86_64.txt
#
# The arguments are the roots of the emulator. `readelf -d <emulator>` shows them in RUNPATH, and
# `readelf -l <emulator>` shows the interpreter. README.md in this folder says which they are and
# how to find the new ones. The script follows the `References:` of the `.narinfo` file of each
# path on cache.nixos.org, so it needs bash, curl, sed, sort and access to cache.nixos.org. It
# needs no Nix.
#
# Each output line is `sha256:<NAR hash in Nix base 32> <NAR size> /nix/store/<path>`, sorted by
# path.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: bash nix-closure.sh <store path>..." >&2
  exit 2
fi

seen=$(mktemp -d)
trap 'rm -rf "$seen"' EXIT
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
LC_ALL=C sort -k3 "$seen"/*
