import RegtestClient from 'test/util/regtest.client'
import { generateKey, getAddress, keyToDescriptor, mnemonicToKey } from '../util/bitcoin'
import { BITCOIN_RPC_ERROR_CODE, ONE_SECOND } from '../util/constants'
import { ensureDockerStack } from '../util/container'

const DEFAULT_WALLET_MNEMONIC = 'ghost ghost ghost ghost ghost ghost ghost ghost ghost ghost ghost machine'

// time
const MINIMUM_BLOCK_INTERVAL_MS = 10 * ONE_SECOND
const MAXIMUM_BLOCK_INTERVAL_MS = 30 * ONE_SECOND

const client = new RegtestClient()

function log(message: string, ...args: any): void {
  console.log('[TEST][SIMULATE_NETWORK]', message, ...args)
}
function logSeparator(): void {
  log('-------------------------------------------------------')
}

async function simulateBlock(address: string, numTransactions?: number): Promise<void> {
  const transactions = numTransactions ?? Math.floor(Math.random() * 10)
  log(`simulating ${transactions} transaction${transactions === 1 ? '' : 's'} in this block`)

  for (let i = 0; i < transactions; i++) {
    const amount = Math.random().toFixed(8)
    log(`creating transaction sending amount ${amount}`)

    try {
      await client.sendToAddress(address, amount)
    } catch (e) {
      if (e.code === BITCOIN_RPC_ERROR_CODE.INSUFFICIENT_FUNDS) {
        log('insufficient funds to continue sending to address, mining a block')
        await client.mineBlocks(1)
        continue
      }
      log('unknown error sending to address', JSON.stringify(e))
      return
    }
  }
  log(`mining a block`)
  await client.mineBlocks(1)
}

async function main() {
  logSeparator()
  log('initializing network...')
  logSeparator()
  await ensureDockerStack()

  await client.initialize()
  const info = await client.getBlockchainInfo()
  log('blockchain info', info)
  logSeparator()

  const sinkAddress = getAddress(generateKey(), '0/0')

  // check if this network has enough tx history to estimatesmartfee
  // this depends on both the number of transactions and the number of blocks
  log('checking if network has enough tx history to estimate fees')
  logSeparator()
  let feeRate: number | undefined
  do {
    const fee = await client.estimateSmartFee(1)
    if (fee.errors) {
      log('could not estimate fee', fee.errors)
      log('generating some transactions to increase tx history')
      await simulateBlock(sinkAddress, 10)
      continue
    }
    feeRate = Number(fee.feerate)
  } while (!feeRate || Number.isNaN(feeRate))
  log('estimated fee:', feeRate)
  log('network initialization finished')
  logSeparator()

  // create a couple wallets
  log('creating a couple wallets for convenience...')
  logSeparator()
  const key = mnemonicToKey(DEFAULT_WALLET_MNEMONIC)
  const pub = keyToDescriptor(key)
  const prv = keyToDescriptor(key, false)
  log(`STATIC funded wallet mnemonic: '${DEFAULT_WALLET_MNEMONIC}'`)
  log('STATIC funded wallet descriptor (public):', pub)
  log('STATIC funded wallet descriptor (private):', prv)
  const address = await getAddress(key, '0/0')
  log('STATIC funded wallet address', address)
  logSeparator()
  await client.sendToAddressAndConfirm(address, 10)

  const key2 = generateKey()
  const pub2 = keyToDescriptor(key2)
  const prv2 = keyToDescriptor(key2, false)
  log('unfunded wallet descriptor (public):', pub2)
  log('unfunded wallet descriptor (private):', prv2)
  const address2 = await getAddress(key2, '0/0')
  log('unfunded wallet address', address2)
  logSeparator()
  logSeparator()
  log('                  ~~ NETWORK READY ~~')
  logSeparator()
  logSeparator()

  // simulate network activity
  log('starting network activity simulation...')
  logSeparator()
  const min = Math.min(MINIMUM_BLOCK_INTERVAL_MS, MAXIMUM_BLOCK_INTERVAL_MS)
  const max = Math.max(MINIMUM_BLOCK_INTERVAL_MS, MAXIMUM_BLOCK_INTERVAL_MS)
  let nextBlockIn = Math.random() * (max - min) + min
  const loop = async () => {
    await simulateBlock(sinkAddress)
    let nextBlock = Math.random() * (max - min) + min
    logSeparator()
    log(`next block in ${Math.floor(nextBlock / ONE_SECOND)} seconds...`)
    setTimeout(loop, nextBlock)
  }
  log(`next block in ${Math.floor(nextBlockIn / ONE_SECOND)} seconds...`)
  setTimeout(loop, nextBlockIn)
}

main()
