#!/usr/bin/env bash
#
# Bump the pinned HWI version in scripts/hwi.json.
#
# Downloads SHA256SUMS.txt.asc from the HWI release, verifies its GPG
# signature against the expected signing key, and writes the verified
# checksums into scripts/hwi.json for the build to consume.
#
# Usage:
#   ./scripts/bump-hwi.sh 3.2.0          # bump to a specific version
#   ./scripts/bump-hwi.sh 3.2.0 --force  # re-pin even if version matches
#
# Prerequisites:
#   - gpg (GnuPG) installed
#   - jq installed
#   - Internet access to fetch the release and GPG key
#
# The signing key fingerprint is hardcoded below. If the HWI project
# rotates its signing key, update SIGNING_KEY before running this script.

set -euo pipefail

SIGNING_KEY="152812300785C96444D3334D17565732E08E5E41"
KEYSERVER="keys.openpgp.org"
HWI_JSON="$(cd "$(dirname "$0")" && pwd)/hwi.json"

# --- args ---

if [ $# -lt 1 ]; then
  echo "Usage: $0 <version> [--force]"
  echo "Example: $0 3.2.0"
  exit 1
fi

VERSION="$1"
FORCE=false
if [ "${2:-}" = "--force" ]; then
  FORCE=true
fi

CURRENT_VERSION=$(jq -r .version "$HWI_JSON" 2>/dev/null || echo "")
if [ "$CURRENT_VERSION" = "$VERSION" ] && [ "$FORCE" = false ]; then
  echo "hwi.json is already at version $VERSION. Use --force to re-pin."
  exit 0
fi

# --- prerequisites ---

for cmd in gpg jq curl; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: $cmd is required but not installed."
    exit 1
  fi
done

# --- ensure signing key ---

if ! gpg --list-keys "$SIGNING_KEY" &>/dev/null; then
  echo "Importing HWI signing key $SIGNING_KEY from $KEYSERVER ..."
  gpg --keyserver "$KEYSERVER" --recv-keys "$SIGNING_KEY"
fi

SIGNER=$(gpg --list-keys --with-colons "$SIGNING_KEY" 2>/dev/null \
  | awk -F: '/^uid/{print $10; exit}')
echo "Signing key: $SIGNING_KEY"
echo "Signer:      $SIGNER"

# --- download and verify ---

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

ASC_URL="https://github.com/bitcoin-core/HWI/releases/download/${VERSION}/SHA256SUMS.txt.asc"
ASC_FILE="$TMPDIR/SHA256SUMS.txt.asc"
VERIFIED_FILE="$TMPDIR/SHA256SUMS.txt"

echo ""
echo "Downloading $ASC_URL ..."
curl -fsSL "$ASC_URL" -o "$ASC_FILE"

echo "Verifying GPG signature ..."
if ! gpg --verify --output "$VERIFIED_FILE" "$ASC_FILE" 2>&1; then
  echo ""
  echo "ERROR: GPG signature verification failed!"
  echo "The SHA256SUMS.txt.asc file may have been tampered with,"
  echo "or the signing key may have changed."
  exit 1
fi

# Confirm the signature was made by the expected key
SIG_KEY=$(gpg --verify "$ASC_FILE" 2>&1 | grep "using RSA key" | awk '{print $NF}')
if [ "$SIG_KEY" != "$SIGNING_KEY" ]; then
  echo ""
  echo "ERROR: Signature was made by key $SIG_KEY, expected $SIGNING_KEY"
  exit 1
fi

echo "GPG signature verified (key: $SIGNING_KEY)"
echo ""

# --- parse checksums for extracted binaries ---

# We want the "/hwi" and "/hwi.exe" entries (extracted binaries), not the archive checksums.
# Format: "<sha256>  <archive>/<binary>"

# Build the JSON with jq for correct formatting
CHECKSUMS_OBJ="{}"
while IFS= read -r line; do
  hash=$(echo "$line" | awk '{print $1}')
  file=$(echo "$line" | awk '{print $2}')
  CHECKSUMS_OBJ=$(echo "$CHECKSUMS_OBJ" | jq --arg k "$file" --arg v "$hash" '. + {($k): $v}')
done < <(grep -E '/hwi(\.exe)?$' "$VERIFIED_FILE" | grep -v 'hwi-qt')

# --- write hwi.json ---

jq -n \
  --arg version "$VERSION" \
  --arg signingKey "$SIGNING_KEY" \
  --arg signingKeyHolder "$SIGNER" \
  --argjson checksums "$CHECKSUMS_OBJ" \
  '{version: $version, signingKey: $signingKey, signingKeyHolder: $signingKeyHolder, checksums: $checksums}' \
  > "$HWI_JSON"

echo "Updated $HWI_JSON:"
echo ""
cat "$HWI_JSON"
echo ""
echo "Done. Review the changes and commit."
