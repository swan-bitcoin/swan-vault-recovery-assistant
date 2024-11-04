import RegtestClient from './util/regtest.client'
import { By, WebElement } from 'selenium-webdriver'
import { beforeAll, describe, expect, it } from 'vitest'
import { driver } from './setup.scenario'
import prand from 'pure-rand'
import { ensureDockerStack } from './util/container'
import { generateKey, getAddress, Key, keysToDescriptor, keyToDescriptor } from './util/bitcoin'

const log = (message: string, ...args: any[]): void => {
  console.log('[TEST][REGTEST_SCENARIO]', message, ...args)
}

const QUICK_TIMEOUT_MS = 500
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const sleepQuickly = () => sleep(QUICK_TIMEOUT_MS)

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
    log('scenario test descriptors', { receiveDescriptor, changeDescriptor })

    destinationKey = generateKey()
    destinationDescriptor = keyToDescriptor(destinationKey)
    destinationAddress = await getAddress(destinationKey, '0/0')
    log('destination address', destinationAddress)
  })

  const expectLatestBalance = async (confirmed: string, unconfirmed: string): Promise<void> => {
    expect(await outputs.temporaryMessage.getText()).toMatch(/Balance fetched successfully!/)
    const stats = await outputs.conversation.findElements(By.css('.stat'))
    expect(stats.length).toBeGreaterThan(1)
    const confirmedValue = await stats[stats.length - 2].findElement(By.css('.stat-value')).getText()
    expect(confirmedValue).toContain(confirmed)
    const unconfirmedValue = await stats[stats.length - 1].findElement(By.css('.stat-value')).getText()
    expect(unconfirmedValue).toContain(unconfirmed)
  }

  const expectAnAddress = async () => {
    await inputs.newAddress.click()
    await sleepQuickly()
    expect(await outputs.temporaryMessage.getText()).toMatch(/Address retrieved successfully!/)
    const elements = await outputs.conversation.findElements(By.css('.break-all'))
    expect(elements.length).toBeGreaterThan(0)
    const address = await elements[elements.length - 1].getText()
    expect(address).toMatch(/^bcrt1/)
    return address
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
    inputs.sweep = await driver.findElement(By.id('sweep-button'))
    expect(inputs.sweep).toBeTruthy()

    // outputs
    outputs.conversation = await driver.findElement(By.id('conversation'))
    expect(outputs.conversation).toBeTruthy()
    outputs.temporaryMessage = await driver.findElement(By.id('temporary-message'))
    expect(outputs.temporaryMessage).toBeTruthy()
  })

  it('can see the receive descriptor box in simple mode', async () => {
    expect(await inputs.receive.isDisplayed()).toBe(true)
    // TODO - though we probably want a different test suite for UX behaviors
    // expect(await inputs.change.isDisplayed()).toBe(false)
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
    await inputs.fetchBalance.click()
    await sleepQuickly()
    await expectLatestBalance('0.00 000 000', '0.00 000 000')
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
    await sleep(3000)
  })

  it('can see an updated unconfirmed balance after receiving sats', async () => {
    await inputs.fetchBalance.click()
    await sleepQuickly()
    await expectLatestBalance('0.00 000 000', `${receiveAmountFixed} 000 000`)
  })

  it('can see an updated confirmed balance after a block is mined', async () => {
    await client.mineBlocks(1)
    await sleepQuickly()
    await inputs.fetchBalance.click()
    await sleepQuickly()
    await expectLatestBalance(`${receiveAmountFixed} 000 000`, '0.00 000 000')
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
    await sleepQuickly()
    await inputs.fetchBalance.click()
    await sleepQuickly()
    await expectLatestBalance(`${changeAmountFixed} 000 000`, '0.00 000 000')
  })

  let fullWalletBalance: number
  let fullWalletBalanceFixed: string
  it('can use the receive descriptor only to see the balance of both receive and change', async () => {
    await inputs.receive.clear()
    await inputs.receive.sendKeys(receiveDescriptor)
    await inputs.fetchBalance.click()
    await sleepQuickly()
    fullWalletBalance = receiveAmount + changeAmount
    fullWalletBalanceFixed = fullWalletBalance.toFixed(2)
    await expectLatestBalance(`${fullWalletBalanceFixed} 000 000`, '0.00 000 000')
  })

  let psbt: string
  it('can get a PSBT for signing without inserting a fee rate', async () => {
    const feeText = await inputs.feeRate.getText()
    expect(feeText).toBe('')
    let psbtText = await inputs.psbt.getAttribute('value')
    expect(psbtText).toBe('')

    await inputs.address.sendKeys(destinationAddress)

    await inputs.sweep.click()
    await sleepQuickly()
    psbtText = await inputs.psbt.getAttribute('value')
    expect(psbtText).toMatch(/^cHNid/)
  })
})
