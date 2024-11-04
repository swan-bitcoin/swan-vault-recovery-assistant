import RegtestClient from './util/regtest.client'
import { By, WebElement } from 'selenium-webdriver'
import { beforeAll, describe, expect, it } from 'vitest'
import { driver } from './setup.scenario'
import prand from 'pure-rand'
import { ensureDockerStack } from './util/container'
import { generateKey, Key, keysToDescriptor } from './util/bitcoin'

const log = (message: string, ...args: any[]): void => {
  console.log('[TEST]', message, ...args)
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const client = new RegtestClient()
const seed = Date.now() ^ (Math.random() * 0x100000000)
const prng = prand.xoroshiro128plus(seed)
beforeAll(
  async () => {
    log('-----------------------------------------')
    log('initiating regtest scenario test')
    log('using prng seed:', seed)
    log('-----------------------------------------')

    try {
      await ensureDockerStack()
      await client.initialize()
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

describe('recovery path, user', function () {
  let keys: Key[]
  let descriptor: string
  let inputs: {
    [key: string]: WebElement
  } = {}
  let outputs: {
    [key: string]: WebElement
  } = {}

  beforeAll(async () => {
    keys = [generateKey(), generateKey(), generateKey()]
    descriptor = keysToDescriptor(keys)
    expect(descriptor).toBeTruthy()
  })

  it('can locate all the expected elements', async () => {
    // inputs and buttons
    inputs.receive = await driver.findElement(By.id('receive-input'))
    expect(inputs.receive).toBeTruthy()
    inputs.change = await driver.findElement(By.id('change-input'))
    expect(inputs.change).toBeTruthy()
    inputs.fetchBalance = await driver.findElement(By.id('fetch-balance-button'))
    expect(inputs.fetchBalance).toBeTruthy()
    inputs.devToggle = await driver.findElement(By.id('dev-mode-toggle'))
    expect(inputs.devToggle).toBeTruthy()
    inputs.electrum = await driver.findElement(By.id('electrum-input'))
    expect(inputs.electrum).toBeTruthy()

    // network selection buttons
    inputs.networkBitcoin = await driver.findElement(By.id('bitcoin'))
    expect(inputs.networkBitcoin).toBeTruthy()
    inputs.networkTestnet = await driver.findElement(By.id('testnet'))
    expect(inputs.networkTestnet).toBeTruthy()
    inputs.networkRegtest = await driver.findElement(By.id('regtest'))
    expect(inputs.networkRegtest).toBeTruthy()

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

  it('fetches a balance of zero for a brand new wallet', async () => {
    await inputs.receive.sendKeys(descriptor)
    expect(await outputs.temporaryMessage.getText()).toMatch(
      /Your wallet configuration is valid. You can now fetch your balance and perform other actions./
    )
    await inputs.fetchBalance.click()
    await sleep(200)

    const stats = await outputs.conversation.findElements(By.css('.stat'))
    expect(stats.length).toBe(2)
    const confirmedValue = await stats[0].findElement(By.css('.stat-value')).getText()
    expect(confirmedValue).toContain('0.00 000 000')
    const unconfirmedValue = await stats[1].findElement(By.css('.stat-value')).getText()
    expect(unconfirmedValue).toContain('0.00 000 000')
  })
})
