# Verifying Swan Vault Recovery Assistant Releases

## Table of Contents

- [Why Verification Matters](#why-verification-matters)
- [Official Download Sources](#official-download-sources)
- [Before You Install: Verification Checklist](#before-you-install-verification-checklist)
- [Downloading the Release](#downloading-the-release)
- [Quick Verification Guide](#quick-verification-guide)
  - [Prerequisites](#prerequisites)
  - [Windows](#windows)
  - [macOS](#macos)
  - [Linux](#linux)
- [Understanding Build Provenance Attestations](#understanding-build-provenance-attestations)
  - [What is a Build Provenance Attestation?](#what-is-a-build-provenance-attestation)
  - [How Do Attestations Work?](#how-do-attestations-work)
  - [What Does Verification Prove?](#what-does-verification-prove)
  - [What Attestations Cannot Prove](#what-attestations-cannot-prove)
- [Detailed Verification Walkthrough](#detailed-verification-walkthrough)
- [Platform-Specific Examples](#platform-specific-examples)
- [Verification Without a GitHub Account](#verification-without-a-github-account)
- [Troubleshooting](#troubleshooting)
- [Further Reading](#further-reading)
- [Questions or Issues](#questions-or-issues)

---

## Why Verification Matters

When you download software that handles Bitcoin, you are trusting that software with access to your funds. A malicious or tampered binary could modify transaction outputs or compromise your security in ways that are difficult to detect.

**Don't trust, verify.**

This principle, central to Bitcoin itself, applies equally to the software you use. Verification allows you to independently confirm that:

1. **The binary you downloaded is authentic** - It was actually built and released by Swan, not by an attacker who compromised a download mirror or performed a man-in-the-middle attack.

2. **The binary matches the source code** - The executable was built from the exact source code in this repository, not from modified code with hidden malware.

3. **The build process was not tampered with** - The binary was produced by GitHub's secure build infrastructure, with a cryptographic chain of custody from source to release.

## Official Download Sources

Swan distributes Swan Vault Recovery Assistant **exclusively** through official GitHub releases:

**https://github.com/swan-bitcoin/swan-vault-recovery-assistant/releases**

You should **always**:

- Download binaries only from the official GitHub releases page linked above
- Verify the build attestation before installing or running the binary
- Be suspicious of binaries obtained from any other source, including links in emails, social media, or third-party websites

## Before You Install: Verification Checklist

Before installing or using any binary claiming to be Swan Vault Recovery Assistant, you should verify its authenticity. There are two verification methods available:

| Step                       | Command                   | What It Verifies                                        | Required?     |
| -------------------------- | ------------------------- | ------------------------------------------------------- | ------------- |
| 1. Build Attestation       | `gh attestation verify`   | Binary was built by GitHub Actions from this repository | **Essential** |
| 2. Release Asset Signature | `gh release verify-asset` | Binary in the release matches what was uploaded         | Recommended   |

### Understanding the Two Verification Steps

**Build Attestation Verification (Essential)**

This is the most important verification step. It cryptographically proves that the binary was built by GitHub Actions from the official `swan-bitcoin/swan-vault-recovery-assistant` repository. This verification:

- **Does not require a GitHub account** when using offline verification with a trusted root
- Proves the binary came from GitHub's secure build infrastructure
- Confirms the exact source code commit that produced the binary

If build attestation verification fails, **do not use the binary**.

**Release Asset Verification (Recommended)**

This additional verification confirms the release asset's integrity within GitHub's release system. This repository uses [immutable releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases#release-asset-integrity), which means release assets cannot be modified after upload. This verification:

- **Requires a GitHub account** to authenticate with the GitHub API
- Provides defense-in-depth by verifying through a second independent mechanism
- Confirms the asset hasn't been tampered with in GitHub's release infrastructure

For maximum assurance, perform both verifications. However, if you don't have a GitHub account, build attestation verification alone provides strong cryptographic proof of authenticity.

---

## Downloading the Release

You can download Swan Vault Recovery Assistant releases in two ways:

**Option 1: Download from the GitHub Releases Page (recommended for most users)**

Visit the official releases page in your browser:

**https://github.com/swan-bitcoin/swan-vault-recovery-assistant/releases**

Before downloading, verify you are on the correct page:

- The URL in your browser's address bar should show exactly `github.com/swan-bitcoin/swan-vault-recovery-assistant`
- Look for the verified organization badge next to "swan-bitcoin"
- Be wary of lookalike URLs (e.g., `swan-bitcoln` with a lowercase L, or `swan-bitcoin.github.io`)

Download the appropriate file for your operating system from the "Assets" section of the latest release.

**Option 2: Download via Command Line**

The examples in this guide include `gh release download` commands that download directly from GitHub. This method is convenient since you will already be using the GitHub CLI for verification.

---

## Quick Verification Guide

If you're comfortable with the command line and just need the commands, here they are. Detailed explanations follow in later sections.

### Prerequisites

Install the [GitHub CLI](https://cli.github.com/) (`gh`):

```bash
# macOS
brew install gh

# Ubuntu/Debian
sudo apt install gh

# Windows (via winget)
winget install GitHub.cli
```

**GitHub Authentication (optional but recommended)**

Authentication is required for release asset verification and provides a smoother experience for attestation verification. If you have a GitHub account:

```bash
gh auth login
```

If you don't have a GitHub account, you can still perform attestation verification using offline mode (see [Verification Without a GitHub Account](#verification-without-a-github-account) below).

replace `<version>` with the version you want to download, such as `v1.0.0`

### Windows

```powershell
# Download the release
gh release download <version> --repo swan-bitcoin/swan-vault-recovery-assistant --pattern "*.exe"

# Verify attestation (essential)
gh attestation verify swan-vault-recovery-assistant_1.0.0_x64-setup.exe --repo swan-bitcoin/swan-vault-recovery-assistant

# Verify release signature (recommended, requires GitHub account)
gh release verify-asset swan-vault-recovery-assistant_1.0.0_x64-setup.exe --repo swan-bitcoin/swan-vault-recovery-assistant
```

### macOS

```bash
# Download the release
gh release download <version> --repo swan-bitcoin/swan-vault-recovery-assistant --pattern "*.dmg"

# Verify attestation (essential)
gh attestation verify swan-vault-recovery-assistant_1.0.0_aarch64.dmg --repo swan-bitcoin/swan-vault-recovery-assistant

# Verify release signature (recommended, requires GitHub account)
gh release verify-asset swan-vault-recovery-assistant_1.0.0_aarch64.dmg --repo swan-bitcoin/swan-vault-recovery-assistant
```

### Linux

```bash
# Download the release (choose your preferred format)
gh release download <version> --repo swan-bitcoin/swan-vault-recovery-assistant --pattern "*.deb"       # Debian/Ubuntu
# gh release download <version> --repo swan-bitcoin/swan-vault-recovery-assistant --pattern "*.rpm"     # Fedora/RHEL
# gh release download <version> --repo swan-bitcoin/swan-vault-recovery-assistant --pattern "*.AppImage" # Universal

# Verify attestation (essential)
gh attestation verify swan-vault-recovery-assistant_1.0.0_amd64.deb --repo swan-bitcoin/swan-vault-recovery-assistant

# Verify release signature (recommended, requires GitHub account)
gh release verify-asset swan-vault-recovery-assistant_1.0.0_amd64.deb --repo swan-bitcoin/swan-vault-recovery-assistant
```

---

## Understanding Build Provenance Attestations

### What is a Build Provenance Attestation?

A build provenance attestation is a cryptographically signed statement that documents:

- **What** was built (the artifact's cryptographic hash)
- **Where** it was built (GitHub Actions)
- **How** it was built (the workflow, inputs, and environment)
- **From what source** it was built (the exact commit in the repository)

Think of it like a notarized certificate of origin for software. Just as you might verify a gold bar's authenticity through assay marks and chain of custody documentation, attestations let you verify a binary's authenticity through cryptographic proof.

You can find more detailed information at the [GitHub Attestations Documentation](https://docs.github.com/en/actions/concepts/security/artifact-attestations).

### How Do Attestations Work?

When Swan releases a new version of Swan Vault Recovery Assistant:

1. **Build Trigger**: A developer tags a release (e.g., `v1.0.0`) in the repository.

2. **Secure Build Environment**: GitHub Actions spins up fresh, isolated virtual machines to build the software. These machines are controlled by GitHub, not Swan, reducing the risk of supply chain attacks.

3. **Compilation**: The source code is compiled into platform-specific binaries (Windows `.exe`/`.msi`, macOS `.dmg`, Linux `.deb`/`.AppImage`/`.rpm`).

4. **Attestation Generation**: GitHub's attestation infrastructure creates a signed statement containing:
   - The SHA-256 hash of each built artifact
   - The repository and commit that was built
   - The workflow file that performed the build
   - A timestamp of when the build occurred

5. **Cryptographic Signing**: The attestation is signed using [Sigstore](https://www.sigstore.dev/), an open-source signing infrastructure. The signature is tied to GitHub's OpenID Connect (OIDC) identity, proving the attestation came from GitHub Actions running in the `swan-bitcoin/swan-vault-recovery-assistant` repository.

6. **Publication**: The signed attestation is stored in GitHub's attestation registry and linked to the release artifacts.

### What Does Verification Prove?

When `gh attestation verify` succeeds, you have cryptographic proof that:

| Claim                   | Meaning                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| **Authentic Origin**    | The binary was built by GitHub Actions, not on someone's personal computer                       |
| **Correct Repository**  | The build ran in `swan-bitcoin/swan-vault-recovery-assistant`, not a fork or imposter repository |
| **Tamper Evidence**     | The binary has not been modified since it was built (any change would invalidate the hash)       |
| **Reproducible Record** | You can inspect the exact commit, workflow, and build logs that produced the binary              |

### What Attestations Cannot Prove

Attestations verify the build process, but they cannot guarantee:

- The source code itself is free of bugs or vulnerabilities
- The developers' intentions are good
- The software will work correctly on your system

Attestations are one layer of security in a defense-in-depth approach. They eliminate certain attack vectors (man-in-the-middle attacks on downloads or malicious binary substitution) while other security practices address other risks.

---

## Detailed Verification Walkthrough

### Step 1: Download the Release

First, download the appropriate binary for your operating system from the releases page:

```bash
# List available releases
gh release list --repo swan-bitcoin/swan-vault-recovery-assistant

# Download a specific <version>, such as v1.0.0 (replace with your OS-appropriate pattern)
gh release download <version> \
  --repo swan-bitcoin/swan-vault-recovery-assistant \
  --pattern "*.dmg"  # macOS
  # --pattern "*.deb"  # Debian/Ubuntu
  # --pattern "*.rpm"  # Fedora/RHEL
  # --pattern "*.AppImage"  # Universal Linux
  # --pattern "*.msi"  # Windows
  # --pattern "*.exe"  # Windows (NSIS installer)
```

### Step 2: Verify the Build Provenance Attestation

The `gh attestation verify` command checks that the binary was built by GitHub Actions from the official repository:

```bash
gh attestation verify swan-vault-recovery-assistant_1.0.0_amd64.deb \
  --repo swan-bitcoin/swan-vault-recovery-assistant
```

**Example successful output:**

```
Loaded digest sha256:abc123... for file://swan-vault-recovery-assistant_1.0.0_amd64.deb
Loaded 1 attestation from GitHub API
✓ Verification succeeded!

sha256:abc123... was attested by:
REPO                                        PREDICATE_TYPE                  WORKFLOW
swan-bitcoin/swan-vault-recovery-assistant  https://slsa.dev/provenance/v1  .github/workflows/build.yml@refs/tags/v1.0.0
```

This output confirms:

- The file's SHA-256 hash matches an attested artifact
- The attestation was created by the `build.yml` workflow
- The build was triggered by the `v1.0.0` tag

**Example failed output (do not use the binary):**

```
✗ Verification failed!

No attestations found for the given artifact
```

### Step 3: Verify the Release Asset Signature

The `gh release verify-asset` command confirms the release was signed by an authorized maintainer:

```bash
gh release verify-asset swan-vault-recovery-assistant_1.0.0_amd64.deb \
  --repo swan-bitcoin/swan-vault-recovery-assistant
```

**Successful output:**

```
✓ Verified signature for swan-vault-recovery-assistant_1.0.0_amd64.deb
```

### Step 3: Inspect Attestation Details (Optional)

For additional assurance, you can inspect the full attestation:

```bash
gh attestation verify swan-vault-recovery-assistant_1.0.0_amd64.deb \
  --repo swan-bitcoin/swan-vault-recovery-assistant \
  --format json | jq .
```

This displays the complete attestation including:

- The exact commit SHA that was built
- Build timestamps
- The full workflow reference
- Sigstore certificate details

---

## Platform-Specific Examples

### macOS (.dmg)

```bash
# Download
gh release download <version> \
  --repo swan-bitcoin/swan-vault-recovery-assistant \
  --pattern "*.dmg"

# Verify attestation
gh attestation verify swan-vault-recovery-assistant_1.0.0_aarch64.dmg \
  --repo swan-bitcoin/swan-vault-recovery-assistant

# Verify release signature
gh release verify-asset swan-vault-recovery-assistant_1.0.0_aarch64.dmg \
  --repo swan-bitcoin/swan-vault-recovery-assistant
```

### Windows (.msi or .exe)

```powershell
# Download
gh release download <version> `
  --repo swan-bitcoin/swan-vault-recovery-assistant `
  --pattern "*.msi"

# Verify attestation
gh attestation verify swan-vault-recovery-assistant_1.0.0_x64-setup.msi `
  --repo swan-bitcoin/swan-vault-recovery-assistant

# Verify release signature
gh release verify-asset swan-vault-recovery-assistant_1.0.0_x64-setup.msi `
  --repo swan-bitcoin/swan-vault-recovery-assistant
```

### Linux AppImage

```bash
# Download
gh release download <version> \
  --repo swan-bitcoin/swan-vault-recovery-assistant \
  --pattern "*.AppImage"

# Verify attestation
gh attestation verify swan-vault-recovery-assistant_1.0.0_amd64.AppImage \
  --repo swan-bitcoin/swan-vault-recovery-assistant

# Verify release signature
gh release verify-asset swan-vault-recovery-assistant_1.0.0_amd64.AppImage \
  --repo swan-bitcoin/swan-vault-recovery-assistant
```

---

## Verification Without a GitHub Account

If you don't have a GitHub account, you can still verify build attestations using offline verification. This method uses a trusted root certificate to verify signatures without contacting GitHub's API.

GitHub's official instructions are [here](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/verify-attestations-offline). However, GitHub's documented approach requires authentication for downloading attestation bundles.

For Swan Vault Recovery Assistant, we provide an alternative approach that works without a GitHub account. The remainder of this section demonstrates how to verify build attestations without authentication.

### Download the Components

1. Download the release from the [releases page](https://github.com/swan-bitcoin/swan-vault-recovery-assistant/releases) in your browser.
2. Locate the correct attestation bundle for your release from [the Attestations page](https://github.com/swan-bitcoin/experiment-github-attestation/attestations) within the Swan Vault Recovery Assistant repository. \<TODO screenshot\>
3. Download the attestation bundle. This file will end in `.sigstore.json`. \<TODO screenshot\>

### Verify the Attestation

```bash
# Verify the attestation
gh attestation verify <filename> \
  --bundle <attestation-bundle-file>
```

Remember: **If build attestation verification fails, do not use the binary.** Download a fresh copy from the official releases page and try again. If verification continues to fail, report the issue immediately.

### What You Cannot Verify Without an Account

Without a GitHub account, you cannot perform release asset verification (`gh release verify-asset`), as this requires authenticated access to GitHub's API. However, the build attestation verification provides the essential cryptographic proof that the binary was built from the official repository.

---

## Troubleshooting

### "No attestations found"

This error means no attestation exists for the file you're verifying. Possible causes:

1. **Wrong filename**: Ensure you're verifying the exact file you downloaded
2. **Modified file**: The file was altered after download (re-download and try again)
3. **Old release**: Releases before attestations were implemented won't have attestations
4. **Unofficial source**: The file didn't come from an official GitHub release

### "Authentication required"

This error occurs when trying to perform release asset verification without being logged in. You have two options:

1. **Log in to GitHub**: Run `gh auth login` and follow the prompts
2. **Skip release verification**: If you don't have a GitHub account, build attestation verification alone provides strong proof of authenticity. See [Verification Without a GitHub Account](#verification-without-a-github-account).

### "Command not found: gh"

Install the GitHub CLI following the [official installation guide](https://cli.github.com/).

---

## Further Reading

- [GitHub Artifact Attestations Documentation](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds)
- [Verifying Artifact Attestations with the GitHub CLI](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/verifying-artifact-attestations-with-the-github-cli)
- [SLSA (Supply-chain Levels for Software Artifacts)](https://slsa.dev/)
- [Sigstore: A New Standard for Signing, Verifying, and Protecting Software](https://www.sigstore.dev/)
- [GitHub CLI Documentation](https://cli.github.com/manual/)

---

## Questions or Issues

If you encounter problems verifying a release or have questions about this process:

1. Check the [GitHub Issues](https://github.com/swan-bitcoin/swan-vault-recovery-assistant/issues) for known problems
2. Open a new issue if your problem isn't already reported
3. [Contact Swan support](https://help.swanbitcoin.com/hc/en-us/requests/new) if you need immediate assistance
