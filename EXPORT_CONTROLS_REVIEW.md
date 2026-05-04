# Export Control Classification Review — Swan Vault Recovery Assistant

## 1. Executive Summary

The software "Swan Vault Recovery Assistant" (SVRA) is classified as EAR99. Its cryptographic functionality is limited to public key derivation for address validation, performed by the open-source BDK (Bitcoin Development Kit) library. All signing operations are delegated to external hardware devices. The software contains no encryption for data confidentiality, which excludes it from Category 5, Part 2 (Information Security) controls.

## 2. Technical Description

SVRA is an open-source desktop application designed to verify and recover Bitcoin wallets.

**Architecture:** The application is a stateless GUI wrapper (built on Tauri v2) that coordinates between the user, a Bitcoin Electrum server, and external hardware wallets. It does not connect directly to the Bitcoin peer-to-peer network.

**Cryptographic Functionality:**

- **Digital Signatures:** All signing operations are delegated to external Hardware Wallet Interface (HWI) binaries, which in turn delegate to physical hardware devices (Jade, Coldcard, Trezor, etc.). The application itself does not perform signing. It does verify signatures during PSBT finalization (via BDK's miniscript library) to confirm that hardware-produced signatures are valid before broadcasting a transaction.
- **Hashing:** The BDK (Bitcoin Development Kit) library, used for wallet operations, transitively includes SHA-256 and RIPEMD-160 via its `bitcoin_hashes` dependency for standard Bitcoin address derivation and validation. The application does not invoke these hash functions directly.
- **Elliptic Curve Operations:** BDK transitively includes `libsecp256k1` for descriptor parsing and address derivation (public key operations only). The `tiny-secp256k1` npm package is present as a development dependency used only in the test suite, not in production code.
- **Key Management:** The software does not generate or store private keys. Private keys remain isolated on external hardware devices. Wallets are constructed from user-supplied public descriptors using an ephemeral, non-persisting in-memory representation.
- **Confidentiality:** The codebase was audited and contains no encryption algorithms (e.g., AES) used for data confidentiality. Standard TLS (via `rustls`) is used only for HTTPS transport to the Electrum server, which is a standard operating system-level network function.

## 3. Classification Analysis

- **ECCN:** EAR99
- **Reason for Control:** None (NLR — No License Required).
- **Justification:** The item was evaluated against Category 5, Part 2. It is excluded from ECCN 5D002 (Information Security Software) based on the following:
  - **Absence of Confidentiality Encryption:** The regulations control "cryptography for data confidentiality." SVRA does not encrypt data-at-rest or data-in-transit at the application layer.
  - **Limitation to Public Key Operations and Signature Verification:** The only cryptographic operations performed by the application are public key derivation, address validation, and signature verification (during PSBT finalization) via the open-source BDK library. All digital signature creation (Bitcoin transaction signing) is delegated to external hardware devices — SVRA itself performs no signing using private keys. Signature verification is an authentication function excluded from ECCN 5D002.
  - **Open Source Status:** The software is published openly under an MIT license, further supporting a decontrolled status (though the functional exclusion takes precedence).

## 4. Detailed Technical Audit of Cryptographic Usage

The following is a point-by-point enumeration of every use of cryptography in SVRA, including transitive dependencies, with an assessment of each against Category 5, Part 2 of the Commerce Control List (CCL).

### 4.1 Elliptic Curve Public Key Derivation (secp256k1)

- **What:** SVRA instantiates a `Secp256k1` context (`bdk_wallet::bitcoin::secp256k1::Secp256k1`) at `src-tauri/src/main.rs` lines 305 and 657. This context is passed to BDK's `into_wallet_descriptor()` method to parse user-supplied descriptor strings and derive child public keys from extended public keys (xpubs).
- **Cryptographic primitive:** Elliptic curve point multiplication (public key derivation only).
- **What it does NOT do:** No private key operations. No signing. No key generation. The `Secp256k1` context is used exclusively to mathematically derive public keys and validate descriptors against a network.
- **Classification relevance:** Public key derivation is not "information security" cryptography. It does not provide confidentiality, and the inputs and outputs are non-secret public key material. **Not controlled.**

### 4.2 SHA-256 Hashing (double-SHA-256 for Transaction IDs)

- **What:** SVRA calls `compute_txid()` (`src-tauri/src/main.rs` line 235) which performs a double-SHA-256 hash of a serialized transaction to produce a transaction identifier (TXID). This is used to compare the TXID before and after the external HWI signing process to detect malicious modification of the transaction.
- **Cryptographic primitive:** SHA-256 (via BDK's `bitcoin` crate, which includes `bitcoin_hashes`).
- **What it does NOT do:** Not used for encryption, key derivation, or message authentication. Used solely as a deterministic fingerprint for data integrity comparison.
- **Classification relevance:** Hashing for data integrity verification is not controlled under Category 5, Part 2. SHA-256 used as a checksum/fingerprint does not provide confidentiality. **Not controlled.**

### 4.3 SHA-256 and RIPEMD-160 Hashing (Address Derivation)

- **What:** BDK internally uses SHA-256 and RIPEMD-160 (via the `bitcoin_hashes` crate in `Cargo.lock`) to derive Bitcoin addresses from public keys. This is the standard Bitcoin address derivation process: `RIPEMD-160(SHA-256(public_key))`. SVRA invokes this indirectly through BDK's `Address::from_script()` (line 878) and through wallet address derivation (line 497).
- **Cryptographic primitive:** SHA-256 and RIPEMD-160 hash functions.
- **What it does NOT do:** Not used for encryption or key derivation from secret material. Inputs are public keys; outputs are public addresses.
- **Classification relevance:** One-way hash functions used for address derivation from public key material do not constitute "information security" cryptography. **Not controlled.**

### 4.4 PSBT Finalization (Signature Verification via BDK/miniscript)

- **What:** SVRA calls `wallet.finalize_psbt()` at lines 520 and 697. Internally, BDK uses the `miniscript` library to evaluate whether the spending conditions of each transaction input are satisfied. This process includes verifying that the ECDSA or Schnorr signatures provided by the external hardware device are cryptographically valid against the corresponding public keys.
- **Cryptographic primitive:** ECDSA and/or Schnorr signature verification (via `libsecp256k1`, transitively through BDK).
- **What it does NOT do:** SVRA does not create signatures. It only verifies signatures that were produced externally by hardware devices. No private key material is involved.
- **Classification relevance:** Signature verification (as opposed to signature generation) using public keys is an authentication function. Under the EAR, authentication-only cryptography is excluded from ECCN 5D002. **Not controlled.**

### 4.5 PSBT Construction (Transaction Building)

- **What:** SVRA calls `wallet.build_tx()` (line 825) to construct unsigned Partially Signed Bitcoin Transactions (PSBTs). This involves UTXO selection, fee calculation, output construction, and serialization into the PSBT format (BIP 174).
- **Cryptographic primitive:** None. PSBT construction is a data serialization operation. The resulting PSBT contains no signatures and no secret material — only public keys, output scripts, and transaction structure.
- **Classification relevance:** No cryptographic operation is performed. **Not controlled.**

### 4.6 Transaction Signing (Delegated to External Hardware)

- **What:** SVRA's `sign()` function (line 720) invokes the HWI sidecar binary via Tauri's shell API: `hwi --chain <network> --device-type <type> signtx <psbt>`. The HWI binary communicates with a physically connected hardware wallet (Jade, Coldcard, Trezor) over USB. The hardware device performs the actual ECDSA/Schnorr signing using private keys stored on the device. SVRA receives back a PSBT containing the signatures.
- **Cryptographic primitive:** None performed by SVRA. The signing is performed entirely by the external hardware device. SVRA only passes the unsigned PSBT string as a command-line argument and receives the signed PSBT string as stdout.
- **What it does NOT do:** SVRA does not access, derive, or process private keys at any point. It does not implement any signing algorithm.
- **Classification relevance:** SVRA is not the performer of the cryptographic operation. The hardware wallet is the cryptographic end-item. **Not controlled** (as pertains to SVRA).

### 4.7 TLS Transport Encryption (Electrum Server Connection)

- **What:** SVRA connects to Electrum servers using `ssl://` URLs (defaults at line 288-289: `ssl://electrum.blockstream.info:50002`). The `electrum-client` crate (version 0.22.0) depends on `rustls` (version 0.23.21), which in turn depends on `aws-lc-rs` and `ring` (version 0.17.14). These libraries implement full TLS 1.2/1.3, including symmetric encryption (AES-128-GCM, AES-256-GCM, ChaCha20-Poly1305) for the encrypted transport channel.
- **Cryptographic primitive:** TLS handshake (ECDHE key exchange, X.509 certificate verification) and symmetric encryption of the transport channel (AES-GCM, ChaCha20-Poly1305).
- **This is the only encryption in the entire dependency tree.**
- **What it does NOT do:** SVRA does not configure, control, or invoke these ciphers directly. It opens an `ssl://` connection string and the `electrum-client` library handles the TLS session. The data transmitted over this channel consists of public blockchain queries (addresses, transaction lookups) and public transaction data (PSBTs, broadcast transactions). No secret material is transmitted.
- **Classification relevance:** TLS used for standard network transport is a ubiquitous function equivalent to any application that makes HTTPS requests. Under EAR §740.17(b)(3)(iii)(A), "mass market" encryption software that uses encryption solely for network transport (e.g., TLS/SSL) is eligible for License Exception ENC without review. Furthermore, `rustls` is independently published open-source software (Apache 2.0/ISC/MIT licensed) not developed by or for Swan. SVRA's use of TLS is incidental to its core function and does not constitute the controlled item. **Not controlled as pertains to SVRA's classification.**

### 4.8 Random Number Generation

- **What:** The `rand_chacha` crate (versions 0.2.2 and 0.3.1) appears in `Cargo.lock` as a dependency of the `rand` crate. ChaCha in this context is used as a cryptographically secure pseudorandom number generator (CSPRNG), not as a stream cipher for encryption.
- **Cryptographic primitive:** ChaCha-based PRNG for randomness generation (used by BDK for UTXO selection randomization and other non-security-critical randomness needs).
- **What it does NOT do:** Not used for encryption. Not used to protect confidentiality of any data.
- **Classification relevance:** A CSPRNG used for non-encryption purposes is not "information security" cryptography. **Not controlled.**

### 4.9 Development/Test-Only Dependencies (Not in Production Build)

The following npm packages appear in `devDependencies` in `package.json` and are used exclusively in the test suite (`test/util/bitcoin.ts`). They are not compiled into or shipped with the production application:

- **`tiny-secp256k1` (^2.2.4):** Elliptic curve library used in tests to create BIP32 key hierarchies for generating test wallet data on regtest.
- **`bip32` (^4.0.0):** BIP32 hierarchical deterministic key derivation, used in tests to derive keypairs for test wallets.
- **`bip39` (^3.1.0):** BIP39 mnemonic seed phrase generation, used in tests to create random test wallets.
- **`bitcoinjs-lib` (^6.1.7):** Bitcoin library used in tests for transaction construction and address generation on regtest.

These libraries perform private key derivation and generation, but only in the test environment and only on the Bitcoin regtest (local test) network. They are not included in the Tauri production build.

- **Classification relevance:** Development tools not shipped in the distributed software. **Not applicable to classification.**

### 4.10 Summary Table

| # | Operation | Primitive | Performed by SVRA? | Provides Confidentiality? | Controlled? |
|---|---|---|---|---|---|
| 4.1 | Public key derivation | secp256k1 EC point multiplication | Yes (via BDK) | No | No |
| 4.2 | Transaction ID computation | Double-SHA-256 | Yes (via BDK) | No | No |
| 4.3 | Address derivation | SHA-256, RIPEMD-160 | Yes (via BDK) | No | No |
| 4.4 | PSBT finalization | ECDSA/Schnorr signature verification | Yes (via BDK) | No | No |
| 4.5 | Transaction construction | None (serialization) | Yes | No | No |
| 4.6 | Transaction signing | ECDSA/Schnorr signing | No (hardware device) | No | No |
| 4.7 | Network transport | TLS (AES-GCM, ChaCha20-Poly1305) | No (rustls library) | Yes (transport only) | No (standard transport) |
| 4.8 | Random number generation | ChaCha PRNG | No (rand crate) | No | No |
| 4.9 | Test key generation | BIP32/BIP39/secp256k1 | No (test only) | No | N/A |

### 4.11 Conclusion

SVRA contains no application-layer encryption for data confidentiality. The only encryption present in the dependency tree is standard TLS for network transport (provided by the independently published open-source `rustls` library), which is incidental to the application's function and is equivalent to any software that makes HTTPS connections. All other cryptographic operations are limited to public key derivation, hashing for address generation and data integrity, and signature verification — none of which constitute "information security" cryptography under the CCL. The software is correctly classified as **EAR99**.

## 5. Licensing & Reporting Requirements

- **License Requirement:** NLR (No License Required).
- **Destinations:** May be exported to all destinations except those under U.S. embargo (Country Group E:1 — e.g., Cuba, Iran, North Korea, Syria, Russia/Belarus).
- **Reporting:** No encryption registration, Self-Classification Report, or CCATS review is required.


Yan Pritzker
CTO

Original memo: December 3, 2025
Updated review: May 4, 2026
