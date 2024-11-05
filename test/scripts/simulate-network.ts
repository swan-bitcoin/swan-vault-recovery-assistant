import RegtestClient from 'test/util/regtest.client'
import { generateKey, getAddress, getMsAddress, keysToDescriptor, keyToDescriptor, mnemonicToKey } from '../util/bitcoin'
import { BITCOIN_RPC_ERROR_CODE, ONE_SECOND } from '../util/constants'
import { ensureDockerStack } from '../util/container'

const DEFAULT_WALLET_MNEMONIC1 = 'ghost ghost ghost ghost ghost ghost ghost ghost ghost ghost ghost machine'
const DEFAULT_WALLET_MNEMONIC2 = 'keen keen keen keen keen keen keen keen keen keen keen join'
const DEFAULT_WALLET_MNEMONIC3 = 'coffee coffee coffee coffee coffee coffee coffee coffee coffee coffee coffee blast'

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
  const ssfKey = mnemonicToKey(DEFAULT_WALLET_MNEMONIC1)
  const ssfPub = keyToDescriptor(ssfKey)
  const ssfPrv = keyToDescriptor(ssfKey, { pub: false })
  log(`STATIC funded singlesig wallet mnemonic: '${DEFAULT_WALLET_MNEMONIC1}'`)
  log('STATIC funded singlesig wallet descriptor (public):', ssfPub)
  log('STATIC funded singlesig wallet descriptor (private):', ssfPrv)
  const ssfAddress = await getAddress(ssfKey, '0/0')
  log('STATIC funded singlesig wallet address', ssfAddress)
  await client.sendToAddressAndConfirm(ssfAddress, 10)
  logSeparator()

  const msfMnemonics = [DEFAULT_WALLET_MNEMONIC1, DEFAULT_WALLET_MNEMONIC2, DEFAULT_WALLET_MNEMONIC3]
  const msfKey2 = mnemonicToKey(msfMnemonics[1])
  const msfKey3 = mnemonicToKey(msfMnemonics[2])
  const msfKeys = [ssfKey, msfKey2, msfKey3]
  const msfPub = keysToDescriptor(msfKeys)
  const msfPrv = keysToDescriptor(msfKeys, { pub: false })
  log(`STATIC funded multisig wallet mnemonics: [\n${msfMnemonics.map((m) => `  '${m}'`).join(',\n')}\n]`)
  log('STATIC funded multisig wallet descriptor (public):', msfPub)
  log('STATIC funded multisig wallet descriptor (private):', msfPrv)
  const address3 = await getMsAddress(msfKeys, '0/0')
  log('STATIC funded multisig wallet address', address3)
  await client.sendToAddressAndConfirm(address3, 10)
  logSeparator()

  const ssuKey = generateKey()
  const ssuPub = keyToDescriptor(ssuKey)
  const ssuPrv = keyToDescriptor(ssuKey, { pub: false })
  log('unfunded wallet descriptor (public):', ssuPub)
  log('unfunded wallet descriptor (private):', ssuPrv)
  const ssuAddress = await getAddress(ssuKey, '0/0')
  log('unfunded wallet address', ssuAddress)
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
