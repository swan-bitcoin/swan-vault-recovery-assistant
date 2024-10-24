import bitcoin, { networks } from 'bitcoinjs-lib'
import { BIP32Factory } from 'bip32'
import * as ecc from 'tiny-secp256k1'
const bip32 = BIP32Factory(ecc)
import * as bip39 from 'bip39'

const DERIVATION_PATH_WPKH_TICK = "m/84'/1'/0'"
const DERIVATION_PATH_WPKH_H = DERIVATION_PATH_WPKH_TICK.replace(/'/g, 'h')

export type Key = {
  master: {
    fingerprint: string
    tprv: string
  }
  derived: {
    tprv: string
    tpub: string
  }
}

export function mnemonicToKey(mnemonic: string): Key {
  const master = bip32.fromSeed(bip39.mnemonicToSeedSync(mnemonic), bitcoin.networks.regtest)
  const derived = master.derivePath(DERIVATION_PATH_WPKH_TICK)
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

export function xprvToKey(xprv: string): Key {
  const master = bip32.fromBase58(xprv, bitcoin.networks.regtest)

  const derived = master.derivePath(DERIVATION_PATH_WPKH_TICK)
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

export const generateKey = (): Key => {
  // this should go without saying, but dont use this for a real wallet ya dingus
  const seed = bitcoin.crypto.sha256(Buffer.from(Math.random().toString()))
  const master = bip32.fromSeed(seed, bitcoin.networks.regtest)
  const derived = master.derivePath(DERIVATION_PATH_WPKH_TICK)
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

export const getAddress = (key: Key, path?: string): string => {
  const pub = bip32.fromBase58(key.derived.tpub, bitcoin.networks.regtest)
  const dpub = path ? pub.derivePath(path) : pub
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: dpub.publicKey,
    network: bitcoin.networks.regtest,
  })
  return address!
}

export const keyToDescriptor = (key: Key, pub: boolean = true): string => {
  const meta = DERIVATION_PATH_WPKH_TICK.replace(/^m/, key.master.fingerprint)
  return `wpkh([${meta}]${pub ? key.derived.tpub : key.derived.tprv}/0/*)`
}
