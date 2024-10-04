/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * scenario: Testing some functionality of the vault service using a regtest fulcrum server
 * dependencies:
 *  - server: yes
 *  - db: yes
 *  - coreApiServer: no
 *  - bdk: yes, regtest
 *  - bitgo: yes, test
 */

import { afterAll, beforeAll, describe, test, expect, it } from "vitest";
import RegtestClient from "./regtest.client";
import bitcoin, { networks } from "bitcoinjs-lib";
import prand from "pure-rand";
import { BIP32Factory } from "bip32";
import * as ecc from "tiny-secp256k1";
const bip32 = BIP32Factory(ecc);

const BASE_URL: string = "http://localhost:3105";
const DERIVATION_PATH_FORMAT_MULTI_TICK = "m/48'/1'/0'/2'";
const DERIVATION_PATH_FORMAT_MULTI_H = "m/48h/1h/0h/2h";
const DERIVATION_PATH_FORMAT_SINGLE_TICK = "m/84'/1'/0'";
const DERIVATION_PATH_FORMAT_SINGLE_H = "m/84h/1h/0h";
const TIMEOUT_PER_STEP_MS = 60 * 1000; // 1 minute

const log = (message: string, ...args: any[]): void => {
  console.log("[TEST]", message, ...args);
};

const client = new RegtestClient();
const seed = Date.now() ^ (Math.random() * 0x100000000);
const prng = prand.xoroshiro128plus(seed);
beforeAll(
  async () => {
    log("-----------------------------------------");
    log("initiating regtest integration test");
    log("using prng seed:", seed);
    log("-----------------------------------------");

    try {
      await client.initialize();
    } catch (e) {
      log({ error: e }, "WARNING: could not initialize regtest client");
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  },
  60 * 1000 // 60 seconds
);

// afterAll(async () => {
//   await stopServer();
// });

test("regtest client", async () => {
  const info = await client.getBlockchainInfo();
  expect(info).toBeTruthy();
  expect(info.chain).toBe("regtest");
});

//
// test helpers and tests
//

type Key = {
  master: {
    fingerprint: string;
    tprv: string;
  };
  derived: {
    tprv: string;
    tpub: string;
  };
};

const generateKey = (): Key => {
  // we intentionally do not want to use prand here because we need unique keys on each run!
  const seed = bitcoin.crypto.sha256(Buffer.from(Math.random().toString()));
  const master = bip32.fromSeed(seed, bitcoin.networks.regtest);
  const derived = master.derivePath(DERIVATION_PATH_FORMAT_SINGLE_TICK);
  return {
    master: {
      fingerprint: master.fingerprint.toString("hex"),
      tprv: master.toBase58(),
    },
    derived: {
      tprv: derived.toBase58(),
      tpub: derived.neutered().toBase58(),
    },
  };
};

test("generate a key and create a descriptor", async () => {
  log("-----------------------------------------");
  const key = generateKey();
  const pub = `wpkh([${key.master.fingerprint}/84'/1'/0']${key.derived.tpub}/0/*)`;
  const prv = `wpkh([${key.master.fingerprint}/84'/1'/0']${key.derived.tprv}/0/*)`;
  log("funded wallet descriptor (public):", pub);
  log("funded wallet descriptor (private):", prv);
  const pk = bip32.fromBase58(key.derived.tpub, bitcoin.networks.regtest);
  const dpk = pk.derivePath("0/0");
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: dpk.publicKey,
    network: bitcoin.networks.regtest,
  });
  log("address", address);
  log("-----------------------------------------");
  await client.sendToAddressAndConfirm(address!, 10);

  const key2 = generateKey();
  const pub2 = `wpkh([${key2.master.fingerprint}/84'/1'/0']${key2.derived.tpub}/0/*)`;
  const prv2 = `wpkh([${key2.master.fingerprint}/84'/1'/0']${key2.derived.tprv}/0/*)`;
  log("non-funded descriptor (public):", pub2);
  log("non-funded descriptor (private):", prv2);
  log("-----------------------------------------");
});
