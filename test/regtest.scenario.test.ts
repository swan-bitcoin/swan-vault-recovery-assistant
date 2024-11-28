import RegtestClient from './util/regtest.client'
import { By, WebElement } from 'selenium-webdriver'
import { assert, beforeAll, describe, expect, it } from 'vitest'
import { driver } from './setup.scenario'
import prand from 'pure-rand'
import { ensureDockerStack } from './util/container'
import { generateKey, getAddress, Key, keysToDescriptor, keyToDescriptor, signAllInputs } from './util/bitcoin'
import clipboardy from 'clipboardy'

const log = (message: string, ...args: any[]): void => {
  console.log('[TEST][REGTEST_SCENARIO]', message, ...args)
}

const UI_TIMEOUT_MS = 30_000
const BITCOIN_NETWORK_TIMEOUT_MS = 3_000
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
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

  const waitForUI = async () => {
    let start = Date.now()
    let now
    do {
      await sleep(500)
      const tempMessage = await outputs.temporaryMessage.getText()

      if (!(/^Please wait/.test(tempMessage) || /^Fetching/.test(tempMessage))) {
        return
      }

      now = Date.now()
    } while (now - start < UI_TIMEOUT_MS)

    assert(false)
  }

  const fetchWalletInfo = async () => {
    await inputs.fetchWallet.click()
    await waitForUI()
  }

  const getAddressFromWalletInfo = async () => {
    const elements = await outputs.conversation.findElements(By.className('wallet-info'))
    expect(elements.length).toBeGreaterThan(0)

    const walletElement = elements[elements.length - 1]
    const tabs = await walletElement.findElements(By.className('tab'))
    expect(tabs.length).toBeGreaterThan(2)
    await tabs[2].click()
    await waitForUI()

    const addressElement = await walletElement.findElement(By.id('wallet-address'))
    const address = await addressElement.getText()
    log('wallet address:', address)

    expect(address).toMatch(/^bcrt1/)
    return address
  }

  const expectLatestBalanceFromWalletInfo = async (confirmed: RegExp, unconfirmed: RegExp): Promise<void> => {
    expect(await outputs.temporaryMessage.getText()).toMatch(/Wallet fetched successfully!/)
    const stats = await outputs.conversation.findElements(By.className('stat'))
    expect(stats.length).toBeGreaterThan(1)
    const confirmedValue = await stats[stats.length - 2].findElement(By.className('stat-value')).getText()
    expect(confirmedValue).toMatch(confirmed)
    const unconfirmedValue = await stats[stats.length - 1].findElement(By.className('stat-value')).getText()
    expect(unconfirmedValue).toMatch(unconfirmed)
  }

  const expectLatestMessageToMatch = async (regex: RegExp) => {
    await waitForUI()
    const elements = await outputs.conversation.findElements(By.className('chat-bubble'))
    expect(elements.length).toBeGreaterThan(0)
    const latestMessage = await elements[elements.length - 1].getText()
    expect(latestMessage).toMatch(regex)
  }

  it('can locate all the expected elements', async () => {
    // descriptor fields
    inputs.receive = await driver.findElement(By.id('receive-input'))
    expect(inputs.receive).toBeTruthy()
    inputs.change = await driver.findElement(By.id('change-input'))
    expect(inputs.change).toBeTruthy()

    // basic descriptor actions
    inputs.changeCheckbox = await driver.findElement(By.id('auto-change-checkbox'))
    expect(inputs.changeCheckbox).toBeTruthy()
    inputs.electrumCheckbox = await driver.findElement(By.id('auto-electrum-checkbox'))
    expect(inputs.electrumCheckbox).toBeTruthy()
    inputs.electrum = await driver.findElement(By.id('electrum-input'))
    expect(inputs.electrum).toBeTruthy()
    inputs.feeRate = await driver.findElement(By.id('feerate-input'))
    expect(inputs.feeRate).toBeTruthy()
    inputs.fetchWallet = await driver.findElement(By.id('fetch-wallet-button'))
    expect(inputs.fetchWallet).toBeTruthy()

    // collapse selector
    inputs.walletConfigurationCollapse = await driver.findElement(By.id('wallet-configuration-collapse-radio'))
    expect(inputs.walletConfigurationCollapse).toBeTruthy()

    // network selection buttons
    inputs.networkCheckbox = await driver.findElement(By.id('network-checkbox'))
    expect(inputs.networkCheckbox).toBeTruthy()
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
    inputs.psbtToggle = await driver.findElement(By.id('psbt-details-toggle'))
    expect(inputs.psbtToggle).toBeTruthy()
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
    outputs.psbtStatus = await driver.findElement(By.id('psbt-status'))
    expect(outputs.psbtStatus).toBeTruthy()
  })

  it('can see the receive descriptor box and toggle checkboxes', async () => {
    expect(await inputs.receive.isDisplayed()).toBe(true)
    expect(await inputs.changeCheckbox.isDisplayed()).toBe(true)
    expect(await inputs.changeCheckbox.isSelected()).toBe(true)
    expect(await inputs.electrumCheckbox.isDisplayed()).toBe(true)
    expect(await inputs.electrumCheckbox.isSelected()).toBe(true)
    expect(await inputs.networkCheckbox.isDisplayed()).toBe(true)
    expect(await inputs.networkCheckbox.isSelected()).toBe(true)
  })

  it('can reveal the custom electrum server input', async () => {
    expect(await inputs.electrum.isDisplayed()).toBe(false)

    await inputs.electrumCheckbox.click()
    await waitForUI()

    expect(await inputs.electrumCheckbox.isSelected()).toBe(false)
    expect(await inputs.electrum.isDisplayed()).toBe(true)
    await inputs.electrumCheckbox.click()
  })

  it('can reveal the network radio buttons', async () => {
    expect(await inputs.networkBitcoin.isDisplayed()).toBe(false)
    expect(await inputs.networkTestnet.isDisplayed()).toBe(false)
    expect(await inputs.networkRegtest.isDisplayed()).toBe(false)

    await inputs.networkCheckbox.click()
    await waitForUI()

    expect(await inputs.networkCheckbox.isSelected()).toBe(false)
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
    await fetchWalletInfo()
    await expectLatestBalanceFromWalletInfo(REGEX_BALANCE_ZERO, REGEX_BALANCE_ZERO)
  })

  let address: string
  it('can view a receive address on the wallet info', async () => {
    address = await getAddressFromWalletInfo()
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
    await fetchWalletInfo()
    await expectLatestBalanceFromWalletInfo(REGEX_BALANCE_ZERO, new RegExp(`${receiveAmountFixed} 000 000`))
  })

  it('can see an updated confirmed balance after a block is mined', async () => {
    await client.mineBlocks(1)
    await sleepForBitcoinNetwork()
    await fetchWalletInfo()
    await expectLatestBalanceFromWalletInfo(new RegExp(`${receiveAmountFixed} 000 000`), REGEX_BALANCE_ZERO)
  })

  let changeAmount: number
  let changeAmountFixed: string
  it('can receive sats to a change address', async () => {
    await inputs.receive.clear()
    await inputs.receive.sendKeys(changeDescriptor)
    await fetchWalletInfo()
    const address = await getAddressFromWalletInfo()
    changeAmount = getRandom(10, 2000) / 100
    changeAmountFixed = changeAmount.toFixed(2)
    await client.sendToAddressAndConfirm(address, changeAmount)
    await fetchWalletInfo()
    await expectLatestBalanceFromWalletInfo(new RegExp(`${changeAmountFixed} 000 000`), REGEX_BALANCE_ZERO)
  })

  let fullWalletBalance: number
  let fullWalletBalanceFixed: string
  it('can use the receive descriptor only to see the balance of both receive and change', async () => {
    await inputs.receive.clear()
    await inputs.receive.sendKeys(receiveDescriptor)
    fullWalletBalance = receiveAmount + changeAmount
    fullWalletBalanceFixed = fullWalletBalance.toFixed(2)
    await fetchWalletInfo()
    await expectLatestBalanceFromWalletInfo(new RegExp(`${fullWalletBalanceFixed} 000 000`), REGEX_BALANCE_ZERO)
  })

  it('can toggle the visibility of the change descriptor field', async () => {
    expect(await inputs.change.isDisplayed()).toBe(false)
    await inputs.changeCheckbox.click()
    await waitForUI()
    expect(await inputs.change.isDisplayed()).toBe(true)
  })

  it('can see the receive balance only when auto-change is disabled', async () => {
    await fetchWalletInfo()
    await expectLatestBalanceFromWalletInfo(new RegExp(`${receiveAmountFixed} 000 000`), REGEX_BALANCE_ZERO)
  })

  it('can restore auto-change to see the full balance', async () => {
    await inputs.changeCheckbox.click()
    await waitForUI()
    expect(await inputs.change.isDisplayed()).toBe(false)
    await fetchWalletInfo()
    await expectLatestBalanceFromWalletInfo(new RegExp(`${fullWalletBalanceFixed} 000 000`), REGEX_BALANCE_ZERO)
  })

  it('begins recovery', async () => {
    const beginRecoveryButton = await driver.findElement(By.id('begin-recovery-btn'))
    await beginRecoveryButton.click()
    await waitForUI()
  })

  let psbt: string
  it('can get a PSBT for signing without inserting a fee rate', async () => {
    const feeText = await inputs.feeRate.getText()
    expect(feeText).toBe('')
    psbt = await inputs.psbt.getAttribute('value')
    expect(psbt).toBe('')

    await inputs.address.sendKeys(destinationAddress)

    await inputs.sweep.click()
    await waitForUI()
    expect(await inputs.broadcast.getCssValue('pointer-events')).toBe('none') // broadcast button should be disabled
    expectLatestMessageToMatch(/Transaction \(PSBT\) created/)
  })

  it('can reveal the PSBT field with the toggle', async () => {
    expect(await inputs.psbtToggle.isSelected()).toBe(false)
    expect(await inputs.psbt.isDisplayed()).toBe(false)
    expect(await inputs.copy.isDisplayed()).toBe(false)
    expect(await inputs.paste.isDisplayed()).toBe(false)

    await inputs.psbtToggle.click()
    await waitForUI()
    expect(await inputs.psbtToggle.isSelected()).toBe(true)
    expect(await inputs.psbt.isDisplayed()).toBe(true)
    expect(await inputs.copy.isDisplayed()).toBe(true)
    expect(await inputs.paste.isDisplayed()).toBe(true)
  })

  it('can copy the PSBT using the copy button', async () => {
    await inputs.copy.click()
    psbt = await clipboardy.read()
    await waitForUI()
    expect(psbt).toMatch(/^cHNid/)
    log('newly-created psbt', psbt)
  })

  it("can see a status of 'unsigned' for a newly-created PSBT", async () => {
    expect(await outputs.psbtStatus.getText()).toMatch(/Unsigned/)
  })

  it('can paste in a PSBT with a single signature, but cannot broadcast it', async () => {
    psbt = signAllInputs(keys[0], psbt)
    log('once-signed psbt', psbt)
    await clipboardy.write(psbt)
    await waitForUI()
    await inputs.paste.click()
    await waitForUI()
    expect(await outputs.temporaryMessage.getText()).toMatch(/^PSBT pasted/)
    expect(await inputs.broadcast.getCssValue('pointer-events')).toBe('auto') // broadcast button should be re-enabled
  })

  it("can see a status of 'partially signed' for the once-signed PSBT", async () => {
    expect(await outputs.psbtStatus.getText()).toMatch(/Partially Signed/)
  })

  it('can paste in a PSBT which has been signed twice, but not finalized, and see the ready status', async () => {
    psbt = signAllInputs(keys[1], psbt)
    log('twice-signed psbt', psbt)
    await clipboardy.write(psbt)
    await waitForUI()
    await inputs.paste.click()
    await waitForUI()
  })

  it("can see a status of 'fully signed' for the once-signed PSBT", async () => {
    expect(await outputs.psbtStatus.getText()).toMatch(/Fully Signed/)
  })

  it('can broadcast the twice-signed psbt', async () => {
    expect(await inputs.broadcast.getCssValue('pointer-events')).toBe('auto') // broadcast button should still be enabled
    await inputs.broadcast.click()
    await waitForUI()
    await expectLatestMessageToMatch(/Broadcast successful!/)
  })

  it('switches back to wallet configuration', async () => {
    await inputs.walletConfigurationCollapse.click()
  })

  it('can see the balance updated after the transaction is broadcast', async () => {
    await sleepForBitcoinNetwork()
    await fetchWalletInfo()
    await expectLatestBalanceFromWalletInfo(REGEX_BALANCE_ZERO, REGEX_BALANCE_ZERO)
  })

  it('can see the unconfirmed balance on the target wallet', async () => {
    await inputs.receive.clear()
    await inputs.receive.sendKeys(destinationDescriptor)
    await fetchWalletInfo()
    await expectLatestBalanceFromWalletInfo(REGEX_BALANCE_ZERO, REGEX_BALANCE_NONZERO)
  })

  it('can see the confirmed balance on the target wallet after a block is mined', async () => {
    await client.mineBlocks(1)
    await sleepForBitcoinNetwork()
    await fetchWalletInfo()
    await expectLatestBalanceFromWalletInfo(REGEX_BALANCE_NONZERO, REGEX_BALANCE_ZERO)
  })
})
