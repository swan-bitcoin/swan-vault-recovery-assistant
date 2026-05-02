# Export Control Classification Review — Swan Vault Recovery Assistant

## 1. Executive Summary

The software "Swan Vault Recovery Assistant" (SVRA) is classified as EAR99. It utilizes cryptography exclusively for authentication and digital signatures, which excludes it from Category 5, Part 2 (Information Security) controls.

## 2. Technical Description

SVRA is an open-source desktop application designed to verify and recover Bitcoin wallets.

**Architecture:** The application is a stateless GUI wrapper (built on Tauri v2) that coordinates between the user, a Bitcoin Electrum server, and external hardware wallets. It does not connect directly to the Bitcoin peer-to-peer network.

**Cryptographic Functionality:**

- **Digital Signatures:** All signing operations are delegated to external Hardware Wallet Interface (HWI) binaries, which in turn delegate to physical hardware devices (Jade, Coldcard, Trezor, etc.). The application itself does not perform signing or signature verification.
- **Hashing:** The BDK (Bitcoin Development Kit) library, used for wallet operations, transitively includes SHA-256 and RIPEMD-160 via its `bitcoin_hashes` dependency for standard Bitcoin address derivation and validation. The application does not invoke these hash functions directly.
- **Elliptic Curve Operations:** BDK transitively includes `libsecp256k1` for descriptor parsing and address derivation (public key operations only). The `tiny-secp256k1` npm package is present as a development dependency used only in the test suite, not in production code.
- **Key Management:** The software does not generate or store private keys. Private keys remain isolated on external hardware devices. Wallets are constructed from user-supplied public descriptors using an ephemeral, non-persisting in-memory representation.
- **Confidentiality:** The codebase was audited and contains no encryption algorithms (e.g., AES) used for data confidentiality. Standard TLS (via `rustls`) is used only for HTTPS transport to the Electrum server, which is a standard operating system-level network function.

## 3. Classification Analysis

- **ECCN:** EAR99
- **Reason for Control:** None (NLR — No License Required).
- **Justification:** The item was evaluated against Category 5, Part 2. It is excluded from ECCN 5D002 (Information Security Software) based on the following:
  - **Absence of Confidentiality Encryption:** The regulations control "cryptography for data confidentiality." SVRA does not encrypt data-at-rest or data-in-transit at the application layer.
  - **Limitation to Digital Signatures:** The cryptographic functionality is limited to "Authentication" and "Digital Signatures" (validating Bitcoin transactions), and all such operations are delegated to external hardware devices.
  - **Open Source Status:** The software is published openly under an MIT license, further supporting a decontrolled status (though the functional exclusion takes precedence).

## 4. Licensing & Reporting Requirements

- **License Requirement:** NLR (No License Required).
- **Destinations:** May be exported to all destinations except those under U.S. embargo (Country Group E:1 — e.g., Cuba, Iran, North Korea, Syria, Russia/Belarus).
- **Reporting:** No encryption registration, Self-Classification Report, or CCATS review is required.

## 5. Compliance Q&A

### Does SVRA encrypt wallet seed phrases, private keys, or recovery data at rest?

No. All keys remain on client hardware devices. SVRA does not generate, store, or process private key material. Wallets are constructed in-memory from user-supplied public descriptors using BDK's `create_wallet_no_persist()` function, and all data is discarded when the application closes.

### Does SVRA encrypt any data in transit beyond standard TLS/SSL?

No. SVRA uses standard TLS (via `ssl://`) for Electrum server connections, which is a standard transport-layer protocol provided by the `rustls` library. SVRA does not implement any additional application-layer encryption beyond this standard network transport. The data transmitted consists only of public wallet descriptors, addresses, and unsigned/signed transaction data (PSBTs) — no secret material.

### Does SVRA use any encryption to protect the confidentiality of user data or communications?

SVRA uses standard TLS for connections to public Electrum servers, which is a ubiquitous transport-layer protocol (via the `rustls` library). This is not application-layer encryption designed to protect user data confidentiality — it is standard network transport equivalent to any application that makes HTTPS requests. SVRA does not encrypt any data at rest, does not store user data, and implements no custom encryption protocols. All data handled (public wallet descriptors, transaction metadata, PSBTs) is non-secret by nature.

### Was the EAR99 classification supported by a formal written technical review?

Yes, performed by the CTO. This document is that review.

### Was outside export counsel or a licensed export compliance consultant involved?

No. The application contains no novel cryptography and implements no encryption for data confidentiality. It is a user interface wrapper around open-source Bitcoin libraries (BDK, HWI).

### Has the classification been reviewed since the software's last material update?

There have been maintenance updates since the original memo (Dec 3, 2025), including dependency upgrades, build/signing fixes, and a migration to the official upstream HWI binary (bitcoin-core/HWI 3.2.0). None introduced new cryptographic functionality or changed the application's technical classification profile. This review (May 1, 2026) confirms EAR99 remains appropriate.

### Is there a classification memo or legal opinion on file?

Yes. This document.

### Do key derivation functions used in SVRA constitute "information security" cryptography under the CCL?

No. SVRA performs only public key derivation (deriving child public keys from extended public keys via BDK). No private key derivation occurs in the application.

### Is there confidentiality protection on private key material that goes beyond authentication?

SVRA does not ever see or process private key material. Private keys remain isolated on external hardware devices at all times.

### Are any zero-knowledge proofs, multi-party computation, or threshold signature schemes used?

No. SVRA supports standard Bitcoin multisig wallets (P2SH/P2WSH), but standard multisig is not a threshold signature scheme — each signer produces an independent signature, and there is no multi-party computation involved.

### Deemed Export Rule

Even if SVRA is correctly classified as EAR99, the deemed export rule applies. Sharing technical data or source code related to SVRA with foreign nationals inside the United States — including employees, contractors, or investors — may constitute an export.

*This question should be addressed by legal counsel with knowledge of Swan's workforce and contractor composition.*

### Does Swan have a Know Your Customer (KYC) and sanctions screening program that covers software distribution?

We do not cover software distribution under our KYC program because we do not generally distribute software. When clients interact with our hosted services, they are covered by our KYC program. We do not and cannot screen clients that download open source software on public platforms like GitHub, where SVRA is hosted. However, GitHub itself does comply with sanctions (https://docs.github.com/en/site-policy/other-site-policies/github-and-trade-controls).

### Has SVRA ever been distributed to users in sanctioned jurisdictions?

We do not and cannot screen clients that download open source software on public platforms like GitHub, where SVRA is hosted. However, GitHub itself does comply with sanctions (https://docs.github.com/en/site-policy/other-site-policies/github-and-trade-controls).

### Are there any non-US customers who may have received SVRA downloads?

We do not and cannot screen clients that download open source software on public platforms like GitHub, where SVRA is hosted. However, GitHub itself does comply with sanctions (https://docs.github.com/en/site-policy/other-site-policies/github-and-trade-controls).

### OFAC Overlay

Bitcoin wallet recovery software has a separate compliance dimension under OFAC. If SVRA could be used to recover wallets associated with sanctioned individuals or entities, Swan could have OFAC exposure entirely separate from the EAR classification question.

This wallet recovery software is an open source, publicly available application that does not have any novel cryptography of its own. It is primarily a user interface. It is not run as or provided as a Swan hosted service. Swan screens every client for OFAC compliance.

### Has Swan ever sought a formal commodity classification ruling (CCATS) from BIS?

No.

### Are any foreign nationals involved in SVRA development or technical support?

*This question should be addressed with knowledge of the employment and contractor status of all contributors.*

---

Yan Pritzker
CTO

Original memo: December 3, 2025
Updated review: May 1, 2026
