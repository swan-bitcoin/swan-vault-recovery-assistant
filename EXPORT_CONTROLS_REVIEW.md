# Export Control Classification Review — Swan Vault Recovery Assistant

## 1. Executive Summary

Swan Vault Recovery Assistant (SVRA) is classified as EAR99. Its cryptographic functionality is limited to public key derivation for address validation, performed by the open-source BDK (Bitcoin Development Kit) library. All signing operations are delegated to external hardware devices. The software contains no encryption for data confidentiality, which excludes it from Category 5, Part 2 (Information Security) controls.

## 2. Technical description

SVRA is an open-source desktop application for verifying and recovering Bitcoin wallets.

The application is a stateless GUI wrapper built on Tauri v2. It coordinates between the user, a Bitcoin Electrum server, and external hardware wallets. It does not connect directly to the Bitcoin peer-to-peer network.

Cryptographic functionality:

- Digital signatures: All signing operations are delegated to external Hardware Wallet Interface (HWI) binaries, which in turn delegate to physical hardware devices (Jade, Coldcard, Trezor, etc.). The application itself does not perform signing. It does verify signatures during PSBT finalization (via BDK's miniscript library) to confirm that hardware-produced signatures are valid before broadcasting a transaction.
- Hashing: BDK transitively includes SHA-256, SHA-512, RIPEMD-160, and HMAC-SHA512 via its `bitcoin_hashes` dependency for standard Bitcoin address derivation, validation, and BIP32 key derivation. The application does not invoke these hash functions directly.
- Elliptic curve operations: BDK transitively includes `libsecp256k1` for descriptor parsing, address derivation, and signature verification including both ECDSA and Schnorr/Taproot (public key operations only). The `tiny-secp256k1` npm package is a dev dependency used only in the test suite, not in production code.
- Key management: The software does not generate or store private keys. Private keys remain isolated on external hardware devices. Wallets are constructed from user-supplied public descriptors using an ephemeral, non-persisting in-memory representation.
- Confidentiality: The codebase was audited and contains no encryption algorithms (e.g., AES) used for data confidentiality. Standard TLS (via `rustls`) is used only for HTTPS transport to the Electrum server, which is a standard OS-level network function.

## 3. Classification analysis

- ECCN: EAR99
- Reason for control: None (NLR — No License Required).
- Justification: The item was evaluated against Category 5, Part 2. It is excluded from ECCN 5D002 (Information Security Software) because:
  - It performs no confidentiality encryption. The regulations control "cryptography for data confidentiality." SVRA does not encrypt data at rest or data in transit at the application layer.
  - Its cryptographic operations are limited to public key derivation, address validation, and signature verification (during PSBT finalization), all via the open-source BDK library. All digital signature creation (Bitcoin transaction signing) is delegated to external hardware devices. SVRA never signs using private keys. Signature verification is an authentication function excluded from ECCN 5D002.
  - The software is published openly under an MIT license on GitHub (https://github.com/swan-bitcoin/swan-vault-recovery-assistant), fully publicly available without any access restrictions. GitHub complies with U.S. sanctions controls. While the functional exclusion from ECCN 5D002 takes precedence, the publicly available nature of the source code further supports a decontrolled status.
  - Even under the least favorable interpretation — if SVRA were argued to fall under ECCN 5D002 — it would qualify for License Exception ENC under §740.17(b)(1) as mass market software or §740.17(b)(3)(iii)(A) as software whose encryption is limited to standard network transport (TLS).

## 4. Detailed technical audit of cryptographic usage

Every use of cryptography in SVRA, including transitive dependencies, is enumerated below with an assessment against Category 5, Part 2 of the Commerce Control List (CCL).

### 4.1 Elliptic curve public key derivation and signature verification (secp256k1)

SVRA instantiates a `Secp256k1` context (`bdk_wallet::bitcoin::secp256k1::Secp256k1`) at `src-tauri/src/main.rs` lines 305 and 657. This context is passed to BDK's `into_wallet_descriptor()` method to parse user-supplied descriptor strings and derive child public keys from extended public keys (xpubs). The `secp256k1` crate (v0.29.1) includes support for both ECDSA and Schnorr signature verification, used during PSBT finalization (see §4.4).

The primitives are elliptic curve point multiplication (public key derivation) and signature verification. No private key operations, signing, or key generation occurs. The inputs and outputs are non-secret public key material.

Public key derivation and signature verification are not "information security" cryptography and do not provide confidentiality. Not controlled.

### 4.2 SHA-256 hashing (transaction IDs)

SVRA calls `compute_txid()` (`src-tauri/src/main.rs` line 235), which performs a double-SHA-256 hash of a serialized transaction to produce a transaction identifier (TXID). This is used to compare the TXID before and after the external HWI signing process to detect malicious modification of the transaction.

The primitive is SHA-256 (via BDK's `bitcoin` crate, which includes `bitcoin_hashes`). It is used solely as a deterministic fingerprint for data integrity comparison, not for encryption, key derivation, or message authentication.

Hashing for data integrity verification is not controlled under Category 5, Part 2. Not controlled.

### 4.3 SHA-256, SHA-512, RIPEMD-160, and HMAC-SHA512 hashing (address and key derivation)

BDK internally uses SHA-256, SHA-512, RIPEMD-160, and HMAC-SHA512 (via the `bitcoin_hashes` crate in `Cargo.lock`) for Bitcoin address derivation and BIP32 hierarchical deterministic key derivation. The standard Bitcoin address derivation process is `RIPEMD-160(SHA-256(public_key))`. BIP32 child public key derivation uses HMAC-SHA512 to derive child chain codes from parent public keys. SVRA invokes these indirectly through BDK's `Address::from_script()` (line 878) and through wallet address derivation (line 497).

Inputs are public keys and chain codes; outputs are public addresses and child public keys. These one-way hash functions are not used for encryption or key derivation from secret material. Not controlled.

### 4.4 PSBT finalization (signature verification via BDK/miniscript)

SVRA calls `wallet.finalize_psbt()` at lines 520 and 697. Internally, BDK uses the `miniscript` library to evaluate whether the spending conditions of each transaction input are satisfied. This includes verifying that the ECDSA or Schnorr signatures provided by the external hardware device are cryptographically valid against the corresponding public keys.

SVRA does not create signatures. It only verifies ECDSA and Schnorr/Taproot signatures that were produced externally by hardware devices (the code checks for Taproot key signatures at line 709). No private key material is involved. Signature verification using public keys is an authentication function, and under the EAR, authentication-only cryptography is excluded from ECCN 5D002. Not controlled.

### 4.5 PSBT construction (transaction building)

SVRA calls `wallet.build_tx()` (line 825) to construct unsigned Partially Signed Bitcoin Transactions (PSBTs). This involves UTXO selection, fee calculation, output construction, and serialization into the PSBT format (BIP 174).

No cryptographic operation is performed. PSBT construction is a data serialization operation. The resulting PSBT contains no signatures and no secret material, only public keys, output scripts, and transaction structure. Not controlled.

### 4.6 Transaction signing (delegated to external hardware)

SVRA's `sign()` function (line 720) invokes the HWI sidecar binary via Tauri's shell API: `hwi --chain <network> --device-type <type> signtx <psbt>`. The HWI binary communicates with a physically connected hardware wallet (Jade, Coldcard, Trezor) over USB. The hardware device performs the actual ECDSA/Schnorr signing using private keys stored on the device. SVRA receives back a PSBT containing the signatures.

SVRA is not the performer of the cryptographic operation. It passes the unsigned PSBT string as a command-line argument and receives the signed PSBT string as stdout. It does not access, derive, or process private keys at any point and implements no signing algorithm. The hardware wallet is the cryptographic end-item. Not controlled as pertains to SVRA.

The HWI binary (v3.2.0) is bundled with SVRA as a Tauri sidecar and is included in the distributed application package. HWI is an independently developed and classified open-source project published by Bitcoin Core under the MIT license (https://github.com/bitcoin-core/HWI). It functions solely as a transport layer: it serializes PSBTs into the device-specific USB/HID protocol, transmits them to the physically connected hardware wallet for signing, and returns the hardware wallet's response. HWI does not perform signing itself. Its classification is independent of SVRA's and is the responsibility of its upstream maintainers.

### 4.7 TLS transport encryption (Electrum server connection)

SVRA connects to Electrum servers using `ssl://` URLs (defaults at line 288-289: `ssl://electrum.blockstream.info:50002`). The `electrum-client` crate (version 0.22.0) depends on `rustls` (version 0.23.21), which in turn depends on `aws-lc-rs` and `ring` (version 0.17.14). These libraries implement TLS 1.2/1.3, including symmetric encryption (AES-128-GCM, AES-256-GCM, ChaCha20-Poly1305) for the encrypted transport channel.

This is the only encryption in the entire dependency tree.

SVRA does not configure, control, or invoke these ciphers directly. It opens an `ssl://` connection string and the `electrum-client` library handles the TLS session. The data transmitted over this channel consists of public blockchain queries (addresses, transaction lookups) and public transaction data (PSBTs, broadcast transactions). No secret material is transmitted. The TLS stack also performs standard X.509 certificate chain validation via `rustls-webpki` as part of server authentication.

The underlying cryptographic libraries (`aws-lc-rs`, `ring`) contain broad cryptographic capabilities (AES in multiple modes, ECDH key exchange, HKDF, etc.) as internal implementation details of TLS. These capabilities are not exposed to or invoked by the application. All cryptographic libraries in the dependency tree are fully open-source and publicly available.

TLS for network transport is equivalent to any application that makes HTTPS requests. Under EAR §740.17(b)(3)(iii)(A), mass market encryption software that uses encryption solely for network transport (e.g., TLS/SSL) is eligible for License Exception ENC without review. `rustls` is independently published open-source software (Apache 2.0/ISC/MIT licensed) not developed by or for Swan. SVRA's use of TLS is incidental to its function and does not constitute the controlled item. Not controlled as pertains to SVRA's classification.

### 4.8 Random number generation

The `rand_chacha` crate (versions 0.2.2 and 0.3.1) appears in `Cargo.lock` as a dependency of the `rand` crate. ChaCha in this context is a cryptographically secure pseudorandom number generator (CSPRNG), not a stream cipher for encryption. BDK uses it for UTXO selection randomization and other non-security-critical randomness needs.

A CSPRNG used for non-encryption purposes is not "information security" cryptography. Not controlled.

### 4.9 Dev/test-only dependencies (not in production build)

The following npm packages appear in `devDependencies` in `package.json` and are used exclusively in the test suite (`test/util/bitcoin.ts`). They are not compiled into or shipped with the production application:

- `tiny-secp256k1` (^2.2.4): Elliptic curve library used in tests to create BIP32 key hierarchies for generating test wallet data on regtest.
- `bip32` (^4.0.0): BIP32 hierarchical deterministic key derivation, used in tests to derive keypairs for test wallets.
- `bip39` (^3.1.0): BIP39 mnemonic seed phrase generation, used in tests to create random test wallets.
- `bitcoinjs-lib` (^6.1.7): Bitcoin library used in tests for transaction construction and address generation on regtest.

These libraries perform private key derivation and generation, but only in the test environment and only on the Bitcoin regtest (local test) network. They are not included in the Tauri production build. Not applicable to classification.

### 4.10 Summary table

| # | Operation | Primitive | Performed by SVRA? | Provides confidentiality? | Controlled? |
|---|---|---|---|---|---|
| 4.1 | Public key derivation | secp256k1 EC point multiplication | Yes (via BDK) | No | No |
| 4.1 | Schnorr/Taproot signature verification | secp256k1 Schnorr | Yes (via BDK) | No | No |
| 4.2 | Transaction ID computation | Double-SHA-256 | Yes (via BDK) | No | No |
| 4.3 | Address derivation | SHA-256, RIPEMD-160 | Yes (via BDK) | No | No |
| 4.3 | BIP32 child key derivation | SHA-512, HMAC-SHA512 | Yes (via BDK) | No | No |
| 4.4 | PSBT finalization | ECDSA/Schnorr signature verification | Yes (via BDK) | No | No |
| 4.5 | Transaction construction | None (serialization) | Yes | No | No |
| 4.6 | Transaction signing | ECDSA/Schnorr signing | No (hardware device) | No | No |
| 4.6 | HWI sidecar (bundled) | Transport to hardware device | No (HWI binary) | No | No (independent OSS) |
| 4.7 | Network transport | TLS (AES-GCM, ChaCha20-Poly1305) | No (rustls library) | Yes (transport only) | No (standard transport) |
| 4.7 | Certificate validation | X.509 chain verification | No (rustls-webpki) | No | No (part of TLS) |
| 4.8 | Random number generation | ChaCha PRNG | No (rand crate) | No | No |
| 4.9 | Test key generation | BIP32/BIP39/secp256k1 | No (test only) | No | N/A |

### 4.11 Conclusion

SVRA contains no application-layer encryption for data confidentiality. The only encryption in the dependency tree is standard TLS for network transport, provided by the independently published open-source `rustls` library. That is incidental to the application's function and equivalent to any software that makes HTTPS connections. All other cryptographic operations are limited to public key derivation, hashing for address generation and data integrity, and signature verification. None of these constitute "information security" cryptography under the CCL. The software is correctly classified as EAR99.

## 5. Licensing and reporting requirements

- License requirement: NLR (No License Required).
- Destinations: May be exported to all destinations except those under U.S. embargo (Country Group E:1, e.g., Cuba, Iran, North Korea, Syria, Russia/Belarus).
- Reporting: No encryption registration, Self-Classification Report, or CCATS review is required.
- Re-export: Because SVRA contains no application-layer encryption, there are no re-export obligations for recipients of the software beyond standard EAR99 restrictions (embargoed destinations).
- Change management: This classification must be re-reviewed if new dependencies introducing encryption functionality are added to the project.


Yan Pritzker
CTO

Original memo: December 3, 2025
Updated review: May 4, 2026
