/* eslint-disable @typescript-eslint/no-explicit-any */

import { afterAll, beforeAll, describe, test, expect, it } from 'vitest'
import RegtestClient from './util/regtest.client'
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
  'ghost ghost ghost ghost ghost ghost ghost ghost ghost ghost ghost machine'
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
    log('initiating regtest scenario test')
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

test('regtest client', async () => {
  const info = await client.getBlockchainInfo()
  expect(info).toBeTruthy()
  expect(info.chain).toBe('regtest')
})

//
// test helpers and tests
//
