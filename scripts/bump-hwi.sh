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
# Signing key verification:
#
# The signing key fingerprint is hardcoded below. HWI releases are signed
# by achow101 (Ava Chow), a Bitcoin Core maintainer. To verify the key:
#
#   1. Check who signed a release:
#      curl -sL https://github.com/bitcoin-core/HWI/releases/download/<version>/SHA256SUMS.txt.asc | gpg --verify 2>&1
#
#   2. Cross-reference the key fingerprint against Bitcoin Core's
#      trusted-keys list (where achow101's key is registered):
#      https://github.com/bitcoin-core/guix.sigs/tree/main/builder-keys
#
#   3. Or fetch it directly from a keyserver:
#      gpg --keyserver keys.openpgp.org --recv-keys 152812300785C96444D3334D17565732E08E5E41
#
# If the HWI project rotates its signing key, verify the new key against
# the sources above before updating SIGNING_KEY.

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
STATUS_FILE="$TMPDIR/gpg-status.txt"

echo ""
echo "Downloading $ASC_URL ..."
curl -fsSL "$ASC_URL" -o "$ASC_FILE"

echo "Verifying GPG signature ..."
if ! gpg --status-file "$STATUS_FILE" --output "$VERIFIED_FILE" --verify "$ASC_FILE"; then
  echo ""
  echo "ERROR: GPG signature verification failed!"
  echo "The SHA256SUMS.txt.asc file may have been tampered with,"
  echo "or the signing key may have changed."
  exit 1
fi

# Confirm the signature was made by the expected key, using GPG's machine-readable
# status output. VALIDSIG args after "[GNUPG:] VALIDSIG":
#   $1=signing-key-fpr ... $LAST=primary-key-fpr (or "-" if unavailable)
# Match against the primary key fingerprint so this stays robust if achow101
# ever signs from a subkey.
VALIDSIG_LINE=$(grep '^\[GNUPG:\] VALIDSIG ' "$STATUS_FILE" || true)
if [ -z "$VALIDSIG_LINE" ]; then
  echo ""
  echo "ERROR: GPG produced no VALIDSIG status line — signature not verifiable."
  exit 1
fi
SIG_SIGNING=$(echo "$VALIDSIG_LINE" | awk '{print $3}')
SIG_PRIMARY=$(echo "$VALIDSIG_LINE" | awk '{print $NF}')
if [ "$SIG_PRIMARY" = "-" ]; then
  SIG_PRIMARY="$SIG_SIGNING"
fi
if [ "$SIG_PRIMARY" != "$SIGNING_KEY" ]; then
  echo ""
  echo "ERROR: Signature primary key is $SIG_PRIMARY (signing key $SIG_SIGNING),"
  echo "       expected $SIGNING_KEY"
  exit 1
fi

echo "GPG signature verified (primary key: $SIGNING_KEY)"
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

# signingKey/signingKeyHolder are informational. The build (fetch-hwi.ts) does
# not enforce them — the authoritative fingerprint is the SIGNING_KEY constant
# above. _note documents this in-file for anyone reading hwi.json directly.
NOTE="signingKey/signingKeyHolder record who signed the SHA256SUMS at pin time. They are informational only — fetch-hwi.ts does not enforce them. The authoritative fingerprint lives in scripts/bump-hwi.sh; the only build-time check is checksums against the downloaded binary."

jq -n \
  --arg note "$NOTE" \
  --arg version "$VERSION" \
  --arg signingKey "$SIGNING_KEY" \
  --arg signingKeyHolder "$SIGNER" \
  --argjson checksums "$CHECKSUMS_OBJ" \
  '{_note: $note, version: $version, signingKey: $signingKey, signingKeyHolder: $signingKeyHolder, checksums: $checksums}' \
  > "$HWI_JSON"

echo "Updated $HWI_JSON:"
echo ""
cat "$HWI_JSON"
echo ""
echo "Done. Review the changes and commit."
