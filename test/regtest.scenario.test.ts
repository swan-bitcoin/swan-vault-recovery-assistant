import RegtestClient from './util/regtest.client'
import { By, WebElement } from 'selenium-webdriver'
import { beforeAll, describe, expect, it } from 'vitest'
import { driver } from './setup.scenario'
import prand from 'pure-rand'
import { ensureDockerStack } from './util/container'
import { generateKey, getAddress, Key, keysToDescriptor, keyToDescriptor, signAllInputs } from './util/bitcoin'
import clipboardy from 'clipboardy'

const log = (message: string, ...args: any[]): void => {
  console.log('[TEST][REGTEST_SCENARIO]', message, ...args)
}

const UI_TIMEOUT_MS = 500
const BITCOIN_NETWORK_TIMEOUT_MS = 3000
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const sleepForUI = () => sleep(UI_TIMEOUT_MS)
const sleepForBitcoinNetwork = () => sleep(BITCOIN_NETWORK_TIMEOUT_MS)

const REGEX_BALANCE_NONZERO = /(?!0\.00 000 000)(\d\.\d{2} \d{3} \d{3})$/
const REGEX_BALANCE_ZERO = /0\.00 000 000$/

const seed = Number(process.env.TEMPURA_SCENARIO_RANDOM_SEED) || Date.now() ^ (Math.random() * 0x100000000)
const prng = prand.xoroshiro128plus(seed)
const getRandom = (low: number, high: number): number => {
  const r = prand.unsafeUniformIntDistribution(low, high, prng)
  console.log(`[TEST][RANDOM_GENERATOR] generated random number in range [${low}, ${high}]: ${r}`)
  return r
}

const client = new RegtestClient()
beforeAll(
  async () => {
    log('-----------------------------------------')
    log('initiating regtest scenario test')
    log('using prng seed:', seed)
    log('-----------------------------------------')

    try {
      await ensureDockerStack()
      await client.initialize()
      await client.ensureEstimateSmartFee()
    } catch (e) {
      log('WARNING: could not initialize regtest client', { error: e })
    }

    await new Promise((resolve) => setTimeout(resolve, 2000))
  },
  60 * 1000 // 60 seconds
)

describe('sanity checks. scenario test setup', function () {
  it('initialized the regtest client', async () => {
    const info = await client.getBlockchainInfo()
    expect(info).toBeTruthy()
    expect(info.chain).toBe('regtest')
  })

  it('opened the window', async function () {
    const test = await driver.findElement(By.id('temporary-message')).getText()
    expect(test).toMatch(/^Hi there!/)
  })
})

describe('recovery path, user', { timeout: 300_000 /* 5 minutes */ }, function () {
  let keys: Key[]
  let receiveDescriptor: string
  let changeDescriptor: string
  let destinationKey: Key
  let destinationDescriptor: string
  let destinationAddress: string
  let inputs: {
    [key: string]: WebElement
  } = {}
  let outputs: {
    [key: string]: WebElement
  } = {}

  beforeAll(async () => {
    keys = [generateKey(), generateKey(), generateKey()]
    receiveDescriptor = keysToDescriptor(keys)
    expect(receiveDescriptor).toBeTruthy()
    changeDescriptor = keysToDescriptor(keys, { postfixPath: '/1/*' })
    expect(changeDescriptor).toBeTruthy()
    log('scenario keys', keys)
    log('scenario test descriptors', { receiveDescriptor, changeDescriptor })

    destinationKey = generateKey()
    destinationDescriptor = keyToDescriptor(destinationKey)
    destinationAddress = await getAddress(destinationKey, '0/0')
    log('destination address', destinationAddress)
  })

  const expectAnAddress = async () => {
    await inputs.newAddress.click()
    await sleepForUI()
    expect(await outputs.temporaryMessage.getText()).toMatch(/Address retrieved successfully!/)
    const elements = await outputs.conversation.findElements(By.className('break-all'))
    expect(elements.length).toBeGreaterThan(0)
    const address = await elements[elements.length - 1].getText()
    expect(address).toMatch(/^bcrt1/)
    return address
  }

  const expectLatestBalance = async (confirmed: RegExp, unconfirmed: RegExp): Promise<void> => {
    await inputs.fetchBalance.click()
    await sleepForUI()
    expect(await outputs.temporaryMessage.getText()).toMatch(/Balance fetched successfully!/)
    const stats = await outputs.conversation.findElements(By.className('stat'))
    expect(stats.length).toBeGreaterThan(1)
    const confirmedValue = await stats[stats.length - 2].findElement(By.className('stat-value')).getText()
    expect(confirmedValue).toMatch(confirmed)
    const unconfirmedValue = await stats[stats.length - 1].findElement(By.className('stat-value')).getText()
    expect(unconfirmedValue).toMatch(unconfirmed)
  }

  const expectLatestMessageToMatch = async (regex: RegExp) => {
    await sleepForUI()
    const elements = await outputs.conversation.findElements(By.className('chat-bubble'))
    expect(elements.length).toBeGreaterThan(0)
    const latestMessage = await elements[elements.length - 1].getText()
    expect(latestMessage).toMatch(regex)
  }

  it('can locate all the expected elements', async () => {
    // toggles at the top
    inputs.devToggle = await driver.findElement(By.id('dev-mode-toggle'))
    expect(inputs.devToggle).toBeTruthy()

    // descriptor fields
    inputs.receive = await driver.findElement(By.id('receive-input'))
    expect(inputs.receive).toBeTruthy()
    inputs.change = await driver.findElement(By.id('change-input'))
    expect(inputs.change).toBeTruthy()

    // basic descriptor actions
    inputs.electrum = await driver.findElement(By.id('electrum-input'))
    expect(inputs.electrum).toBeTruthy()
    inputs.feeRate = await driver.findElement(By.id('feerate-input'))
    expect(inputs.feeRate).toBeTruthy()
    inputs.fetchBalance = await driver.findElement(By.id('fetch-balance-button'))
    expect(inputs.fetchBalance).toBeTruthy()
    inputs.newAddress = await driver.findElement(By.id('new-address-button'))
    expect(inputs.newAddress).toBeTruthy()

    // network selection buttons
    inputs.networkBitcoin = await driver.findElement(By.id('bitcoin'))
    expect(inputs.networkBitcoin).toBeTruthy()
    inputs.networkTestnet = await driver.findElement(By.id('testnet'))
    expect(inputs.networkTestnet).toBeTruthy()
    inputs.networkRegtest = await driver.findElement(By.id('regtest'))
    expect(inputs.networkRegtest).toBeTruthy()

    // transaction stuff
    inputs.address = await driver.findElement(By.id('address-input'))
    expect(inputs.address).toBeTruthy()
    inputs.psbt = await driver.findElement(By.id('psbt-textarea'))
    expect(inputs.psbt).toBeTruthy()
    inputs.psbtStatus = await driver.findElement(By.id('psbt-status-button'))
    expect(inputs.psbtStatus).toBeTruthy()
    inputs.sweep = await driver.findElement(By.id('sweep-button'))
    expect(inputs.sweep).toBeTruthy()
    inputs.copy = await driver.findElement(By.id('copy-psbt-button'))
    expect(inputs.copy).toBeTruthy()
    inputs.paste = await driver.findElement(By.id('paste-psbt-button'))
    expect(inputs.paste).toBeTruthy()
    inputs.broadcast = await driver.findElement(By.id('broadcast-button'))
    expect(inputs.broadcast).toBeTruthy()

    // outputs
    outputs.conversation = await driver.findElement(By.id('conversation'))
    expect(outputs.conversation).toBeTruthy()
    outputs.temporaryMessage = await driver.findElement(By.id('temporary-message'))
    expect(outputs.temporaryMessage).toBeTruthy()
  })

  it('can see the receive descriptor box in simple mode', async () => {
    expect(await inputs.receive.isDisplayed()).toBe(true)
    expect(await inputs.change.isDisplayed()).toBe(false)
  })

  it('cannot see the advanced options in simple mode', async () => {
    expect(await inputs.devToggle.isSelected()).toBe(false)
    expect(await inputs.electrum.isDisplayed()).toBe(false)
    expect(await inputs.networkBitcoin.isDisplayed()).toBe(false)
    expect(await inputs.networkTestnet.isDisplayed()).toBe(false)
    expect(await inputs.networkRegtest.isDisplayed()).toBe(false)
  })

  it('can switch to advanced mode', async () => {
    expect(await inputs.devToggle.isDisplayed()).toBe(true)
    expect(await inputs.devToggle.isEnabled()).toBe(true)
    await inputs.devToggle.click()
    expect(await inputs.devToggle.isSelected()).toBe(true)
  })

  it('can see the advanced options in advanced mode', async () => {
    expect(await inputs.devToggle.isSelected()).toBe(true)
    expect(await inputs.electrum.isDisplayed()).toBe(true)
    expect(await inputs.networkBitcoin.isDisplayed()).toBe(true)
    expect(await inputs.networkTestnet.isDisplayed()).toBe(true)
    expect(await inputs.networkRegtest.isDisplayed()).toBe(true)
  })

  it('can switch from bitcoin to regtest network', async () => {
    expect(await inputs.networkBitcoin.isSelected()).toBe(true)
    expect(await inputs.networkTestnet.isSelected()).toBe(false)
    expect(await inputs.networkRegtest.isSelected()).toBe(false)
    await inputs.networkRegtest.click()
    expect(await inputs.networkBitcoin.isSelected()).toBe(false)
    expect(await inputs.networkTestnet.isSelected()).toBe(false)
    expect(await inputs.networkRegtest.isSelected()).toBe(true)
  })

  it('can see a balance of zero for a brand new wallet', async () => {
    await inputs.receive.sendKeys(receiveDescriptor)
    await expectLatestBalance(REGEX_BALANCE_ZERO, REGEX_BALANCE_ZERO)
  })

  let address: string
  it('can fetch an address', async () => {
    address = await expectAnAddress()
  })

  let receiveAmount: number
  let receiveAmountFixed: string
  it('can receive sats to the retrieved address', async () => {
    receiveAmount = getRandom(10, 2000) / 100
    receiveAmountFixed = receiveAmount.toFixed(2)
    await client.sendToAddress(address, receiveAmount)
    await sleepForBitcoinNetwork()
  })

  it('can see an updated unconfirmed balance after receiving sats', async () => {
    await expectLatestBalance(REGEX_BALANCE_ZERO, new RegExp(`${receiveAmountFixed} 000 000`))
  })

  it('can see an updated confirmed balance after a block is mined', async () => {
    await client.mineBlocks(1)
    await sleepForBitcoinNetwork()
    await expectLatestBalance(new RegExp(`${receiveAmountFixed} 000 000`), REGEX_BALANCE_ZERO)
  })

  let changeAmount: number
  let changeAmountFixed: string
  it('can receive sats to a change address', async () => {
    await inputs.receive.clear()
    await inputs.receive.sendKeys(changeDescriptor)
    const address = await expectAnAddress()
    changeAmount = getRandom(10, 2000) / 100
    changeAmountFixed = changeAmount.toFixed(2)
    await client.sendToAddressAndConfirm(address, changeAmount)
    await expectLatestBalance(new RegExp(`${changeAmountFixed} 000 000`), REGEX_BALANCE_ZERO)
  })

  let fullWalletBalance: number
  let fullWalletBalanceFixed: string
  it('can use the receive descriptor only to see the balance of both receive and change', async () => {
    await inputs.receive.clear()
    await inputs.receive.sendKeys(receiveDescriptor)
    fullWalletBalance = receiveAmount + changeAmount
    fullWalletBalanceFixed = fullWalletBalance.toFixed(2)
    await expectLatestBalance(new RegExp(`${fullWalletBalanceFixed} 000 000`), REGEX_BALANCE_ZERO)
  })

  let psbt: string
  it('can get a PSBT for signing without inserting a fee rate', async () => {
    const feeText = await inputs.feeRate.getText()
    expect(feeText).toBe('')
    psbt = await inputs.psbt.getAttribute('value')
    expect(psbt).toBe('')

    await inputs.address.sendKeys(destinationAddress)

    await inputs.sweep.click()
    await sleepForUI()
    expect(await inputs.broadcast.getCssValue('pointer-events')).toBe('none') // broadcast button should be disabled
    await inputs.copy.click()
    psbt = await clipboardy.read()
    expect(psbt).toMatch(/^cHNid/)
  })

  it("can retrieve a status of 'unsigned' for a newly-created PSBT", async () => {
    await inputs.psbtStatus.click()
    await expectLatestMessageToMatch(/The PSBT is unsigned/)
  })

  it('can paste in a PSBT with a single signature, but cannot broadcast it', async () => {
    psbt = signAllInputs(keys[0], psbt)
    log('once-signed psbt', psbt)
    await clipboardy.write(psbt)
    await inputs.paste.click()
    await sleepForUI()
    expect(await outputs.temporaryMessage.getText()).toMatch(/^PSBT pasted/)
    expect(await inputs.broadcast.getCssValue('pointer-events')).toBe('auto') // broadcast button should be re-enabled
    await sleepForUI()
  })

  it("can retrieve a status of 'partially signed' for the once-signed PSBT", async () => {
    await inputs.psbtStatus.click()
    await expectLatestMessageToMatch(/The transaction is partially signed/)
  })

  it('can paste in a PSBT which has been signed twice, but not finalized, and broadcast', async () => {
    psbt = signAllInputs(keys[1], psbt)
    log('twice-signed psbt', psbt)
    await clipboardy.write(psbt)
    await inputs.paste.click()
    await sleepForUI()
    await inputs.psbtStatus.click()
    await expectLatestMessageToMatch(/The transaction is fully signed/)
  })

  it('can broadcast the twice-signed psbt', async () => {
    expect(await inputs.broadcast.getCssValue('pointer-events')).toBe('auto') // broadcast button should still be enabled
    await inputs.broadcast.click()
    await sleepForUI()
    await expectLatestMessageToMatch(/Broadcast successful!/)
  })

  it('can see the balance updated after the transaction is broadcast', async () => {
    await sleepForBitcoinNetwork()
    await expectLatestBalance(REGEX_BALANCE_ZERO, REGEX_BALANCE_ZERO)
  })

  it('can see the unconfirmed balance on the target wallet', async () => {
    await inputs.receive.clear()
    await inputs.receive.sendKeys(destinationDescriptor)
    await expectLatestBalance(REGEX_BALANCE_ZERO, REGEX_BALANCE_NONZERO)
  })

  it('can see the confirmed balance on the target wallet after a block is mined', async () => {
    await client.mineBlocks(1)
    await sleepForBitcoinNetwork()
    await expectLatestBalance(REGEX_BALANCE_NONZERO, REGEX_BALANCE_ZERO)
  })
})
