/* eslint-disable @typescript-eslint/no-explicit-any */

import { afterAll, beforeAll, describe, test, expect, it } from 'vitest'
import RegtestClient from './regtest.client'
import bitcoin, { networks } from 'bitcoinjs-lib'
import prand from 'pure-rand'
import { BIP32Factory } from 'bip32'
import * as ecc from 'tiny-secp256k1'
const bip32 = BIP32Factory(ecc)
import * as bip39 from 'bip39'

/**
 * !! README !!
 *
 * This test suite isn't written yet, but you can use it to fund a wallet for testing.
 *
 * First, start the regtest server with the following command in the root directory:
 * docker compose up
 * or
 * docker compose up -d
 *
 * Then, set either the mnemonic or extended private key values below and run the test.
 *   (you can set the mnemonic to the one used by your hardware device to test signing)
 *
 * You'll see the static wallet funded with 10 BTC per run, and a randomly generated
 * unfunded wallet as well. You can use the descriptors and unfunded address to test spending.
 */
const STATIC_WALLET_MNEMONIC: string | undefined =
  'moment cream pizza cube crack video half organ finger piano eternal define'
const STATIC_WALLET_XPRV: string | undefined = undefined

const BASE_URL: string = 'http://localhost:3105'
const DERIVATION_PATH_FORMAT_MULTI_TICK = "m/48'/1'/0'/2'"
const DERIVATION_PATH_FORMAT_MULTI_H = 'm/48h/1h/0h/2h'
const DERIVATION_PATH_FORMAT_SINGLE_TICK = "m/84'/1'/0'"
const DERIVATION_PATH_FORMAT_SINGLE_H = 'm/84h/1h/0h'
const TIMEOUT_PER_STEP_MS = 60 * 1000 // 1 minute

const log = (message: string, ...args: any[]): void => {
  console.log('[TEST]', message, ...args)
}

const client = new RegtestClient()
const seed = Date.now() ^ (Math.random() * 0x100000000)
const prng = prand.xoroshiro128plus(seed)
beforeAll(
  async () => {
    if (!STATIC_WALLET_MNEMONIC && !STATIC_WALLET_XPRV) {
      throw new Error('you must set either STATIC_WALLET_MNEMONIC or STATIC_WALLET_XPRV')
    }

    log('-----------------------------------------')
    log('initiating regtest integration test')
    log('using prng seed:', seed)
    log('-----------------------------------------')

    try {
      await client.initialize()
    } catch (e) {
      log('WARNING: could not initialize regtest client', { error: e })
    }

    await new Promise((resolve) => setTimeout(resolve, 2000))
  },
  60 * 1000 // 60 seconds
)

// afterAll(async () => {
//   await stopServer();
// });

test('regtest client', async () => {
  const info = await client.getBlockchainInfo()
  expect(info).toBeTruthy()
  expect(info.chain).toBe('regtest')
})

//
// test helpers and tests
//

type Key = {
  master: {
    fingerprint: string
    tprv: string
  }
  derived: {
    tprv: string
    tpub: string
  }
}

const staticKey = (): Key => {
  let master
  if (STATIC_WALLET_MNEMONIC) {
    master = bip32.fromSeed(bip39.mnemonicToSeedSync(STATIC_WALLET_MNEMONIC), bitcoin.networks.regtest)
  } else if (STATIC_WALLET_XPRV) {
    master = bip32.fromBase58(STATIC_WALLET_XPRV, bitcoin.networks.regtest)
  } else {
    throw new Error('no mnemonic or xprv set')
  }

  const derived = master.derivePath(DERIVATION_PATH_FORMAT_SINGLE_TICK)
  return {
    master: {
      fingerprint: master.fingerprint.toString('hex'),
      tprv: master.toBase58(),
    },
    derived: {
      tprv: derived.toBase58(),
      tpub: derived.neutered().toBase58(),
    },
  }
}

const generateKey = (): Key => {
  // we intentionally do not want to use prand here because we need unique keys on each run!
  const seed = bitcoin.crypto.sha256(Buffer.from(Math.random().toString()))
  const master = bip32.fromSeed(seed, bitcoin.networks.regtest)
  const derived = master.derivePath(DERIVATION_PATH_FORMAT_SINGLE_TICK)
  return {
    master: {
      fingerprint: master.fingerprint.toString('hex'),
      tprv: master.toBase58(),
    },
    derived: {
      tprv: derived.toBase58(),
      tpub: derived.neutered().toBase58(),
    },
  }
}

const getAddress = async (key: Key, path: string): Promise<string> => {
  const pk = bip32.fromBase58(key.derived.tpub, bitcoin.networks.regtest)
  const dpk = pk.derivePath(path)
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: dpk.publicKey,
    network: bitcoin.networks.regtest,
  })
  return address!
}

test('generate some keys, create descriptors, fund one wallet', async () => {
  log('-----------------------------------------')
  const key = staticKey()
  const pub = `wpkh([${key.master.fingerprint}/84'/1'/0']${key.derived.tpub}/0/*)`
  const prv = `wpkh([${key.master.fingerprint}/84'/1'/0']${key.derived.tprv}/0/*)`
  log('funded wallet descriptor (public):', pub)
  log('funded wallet descriptor (private):', prv)
  const address = await getAddress(key, '0/0')
  log('address', address)
  log('-----------------------------------------')
  await client.sendToAddressAndConfirm(address!, 10)

  const key2 = generateKey()
  const pub2 = `wpkh([${key2.master.fingerprint}/84'/1'/0']${key2.derived.tpub}/0/*)`
  const prv2 = `wpkh([${key2.master.fingerprint}/84'/1'/0']${key2.derived.tprv}/0/*)`
  log('non-funded descriptor (public):', pub2)
  log('non-funded descriptor (private):', prv2)
  const address2 = await getAddress(key2, '0/0')
  log('address', address2)
  log('-----------------------------------------')
})
