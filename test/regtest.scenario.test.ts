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

const REGEX_BALANCE_NONZERO = /(?!0\.00 000 000)(\d+\.\d{2} \d{3} \d{3})/
const REGEX_BALANCE_ZERO = /0\.00 000 000/

const seed = Number(process.env.SVRA_SCENARIO_RANDOM_SEED) || Date.now() ^ (Math.random() * 0x100000000)
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
    expect(test).toMatch(/^Welcome!/)
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
    let lastMessage: string | undefined = undefined
    do {
      await sleep(500)
      now = Date.now()

      const tempMessage = await outputs.temporaryMessage.getText()
      const elements = await outputs.conversation.findElements(By.className('chat-bubble'))
      if (!(/^Please wait/.test(tempMessage) || /^Fetching/.test(tempMessage))) {
        // if tempMessage doesn't indicate a pending operation and there are no messages, we're done
        if (elements.length === 0) {
          return
        }
      }

      if (elements.length === 0) {
        continue
      }
      const currentMessage = await elements[elements.length - 1].getText()

      // we can assume that the UI is done updating when the latest message hasn't changed
      if (lastMessage && currentMessage === lastMessage) {
        return
      }

      lastMessage = currentMessage
    } while (now - start < UI_TIMEOUT_MS)

    assert(false)
  }

  const fetchWalletInfo = async () => {
    await inputs.fetchWallet.click()
    await waitForUI()
  }

  const expectAddressFromLatestMessage = async () => {
    const address = await expectNthToLastMessageToMatch(0, /^bcrt1.{59}$/)
    log('wallet address:', address)

    expect(address).toMatch(/^bcrt1/)
    return address
  }

  const expectLatestBalanceToMatch = async (confirmed: RegExp, unconfirmed?: RegExp): Promise<void> => {
    const confirmedRegex = new RegExp('Your wallet has a (confirmed )?balance of\\s.*' + confirmed.source)
    await expectNthToLastMessageToMatch(2, confirmedRegex)
    if (unconfirmed) {
      const unconfirmedRegex = new RegExp('₿' + unconfirmed.source + ' is still unconfirmed')
      await expectNthToLastMessageToMatch(2, unconfirmedRegex)
    }
  }

  const expectLatestMessageToMatch = async (regex: RegExp) => {
    return await expectNthToLastMessageToMatch(0, regex)
  }

  const expectNthToLastMessageToMatch = async (n: number, regex: RegExp) => {
    await waitForUI()
    const elements = await outputs.conversation.findElements(By.className('chat-bubble'))
    expect(elements.length).toBeGreaterThan(n - 1)
    const latestMessage = await elements[elements.length - n - 1].getText()
    expect(latestMessage).toMatch(regex)
    return latestMessage
  }

  const expectCardCollapseState = async (card: WebElement, checked: boolean) => {
    const expectedValue = checked ? 'true' : null
    expect(await card.getAttribute('checked')).toBe(expectedValue)
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
    inputs.feeRate = await driver.findElement(By.id('fee-rate-input'))
    expect(inputs.feeRate).toBeTruthy()
    inputs.fetchWallet = await driver.findElement(By.id('fetch-wallet-button'))
    expect(inputs.fetchWallet).toBeTruthy()

    // collapse selectors
    inputs.walletConfigurationCollapse = await driver.findElement(By.id('wallet-configuration-collapse-radio'))
    expect(inputs.walletConfigurationCollapse).toBeTruthy()
    inputs.recoveryOptionsCollapse = await driver.findElement(By.id('recovery-options-collapse-radio'))
    expect(inputs.recoveryOptionsCollapse).toBeTruthy()
    inputs.sendTransactionCollapse = await driver.findElement(By.id('send-transaction-collapse-radio'))
    expect(inputs.sendTransactionCollapse).toBeTruthy()

    // network selection buttons
    inputs.networkCheckbox = await driver.findElement(By.id('network-checkbox'))
    expect(inputs.networkCheckbox).toBeTruthy()
    inputs.networkBitcoin = await driver.findElement(By.id('bitcoin'))
    expect(inputs.networkBitcoin).toBeTruthy()
    inputs.networkTestnet = await driver.findElement(By.id('testnet'))
    expect(inputs.networkTestnet).toBeTruthy()
    inputs.networkRegtest = await driver.findElement(By.id('regtest'))
    expect(inputs.networkRegtest).toBeTruthy()

    // other buttons
    inputs.advancedModeButton = await driver.findElement(By.id('advanced-mode-button'))
    expect(inputs.advancedModeButton).toBeTruthy()

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

    // validation outputs
    outputs.receiveInputValidationMessage = await driver.findElement(By.id('receive-input-validation-message'))
    expect(outputs.receiveInputValidationMessage).toBeTruthy()
    outputs.addressInputValidationMessage = await driver.findElement(By.id('address-input-validation-message'))
    expect(outputs.addressInputValidationMessage).toBeTruthy()
    outputs.psbtInputValidationMessage = await driver.findElement(By.id('psbt-input-validation-message'))
    expect(outputs.psbtInputValidationMessage).toBeTruthy()
  })

  it('can see only the basic interface at launch, but defaults are active', async () => {
    expect(await inputs.receive.isDisplayed()).toBe(true)
    expect(await inputs.changeCheckbox.isDisplayed()).toBe(false)
    expect(await inputs.changeCheckbox.isSelected()).toBe(true)
    expect(await inputs.electrumCheckbox.isDisplayed()).toBe(false)
    expect(await inputs.electrumCheckbox.isSelected()).toBe(true)
    expect(await inputs.networkCheckbox.isDisplayed()).toBe(false)
    expect(await inputs.networkCheckbox.isSelected()).toBe(true)
    await expectCardCollapseState(inputs.walletConfigurationCollapse, true)
    await expectCardCollapseState(inputs.recoveryOptionsCollapse, false)
    await expectCardCollapseState(inputs.sendTransactionCollapse, false)
  })

  it('can switch to advanced mode', async () => {
    await inputs.advancedModeButton.click()
    await waitForUI()
    expect(await inputs.changeCheckbox.isDisplayed()).toBe(true)
    expect(await inputs.electrumCheckbox.isDisplayed()).toBe(true)
    expect(await inputs.networkCheckbox.isDisplayed()).toBe(true)
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

  it('can input an invalid descriptor and see an invalid configuration message', async () => {
    await inputs.receive.sendKeys('sh(invalidDescriptorlolz)')
    await waitForUI()

    expect(await outputs.receiveInputValidationMessage.getText()).toMatch(/Invalid wallet configuration/)
  })

  it('can input a descriptor for a brand new wallet, but see an invalid network message', async () => {
    await inputs.receive.clear()
    await inputs.receive.sendKeys(changeDescriptor) // change is intentional
    await waitForUI()

    expect(await outputs.receiveInputValidationMessage.getText()).toMatch(/wallet configuration is for a different network/)
  })

  it('can switch from bitcoin to testnet network', async () => {
    expect(await inputs.networkBitcoin.isSelected()).toBe(true)
    expect(await inputs.networkTestnet.isSelected()).toBe(false)
    expect(await inputs.networkRegtest.isSelected()).toBe(false)
    await inputs.networkTestnet.click()
    expect(await inputs.networkBitcoin.isSelected()).toBe(false)
    expect(await inputs.networkTestnet.isSelected()).toBe(true)
    expect(await inputs.networkRegtest.isSelected()).toBe(false)
    expect(await outputs.receiveInputValidationMessage.getText()).toMatch(
      /You seem to be using a change descriptor for your wallet configuration/
    )
  })

  it('can switch from testnet to regtest network', async () => {
    await inputs.networkRegtest.click()
    expect(await inputs.networkBitcoin.isSelected()).toBe(false)
    expect(await inputs.networkTestnet.isSelected()).toBe(false)
    expect(await inputs.networkRegtest.isSelected()).toBe(true)
  })

  it('can see a balance of zero for a brand new wallet', async () => {
    await inputs.receive.clear()
    await inputs.receive.sendKeys(receiveDescriptor)
    await waitForUI()
    expect(await outputs.receiveInputValidationMessage.getText()).toMatch(/Your wallet configuration is valid/)

    await fetchWalletInfo()
    await expectNthToLastMessageToMatch(2, /The wallet seems to be unused/)
    await expectNthToLastMessageToMatch(1, /to deposit funds, you can .* following wallet address/)
  })

  let address: string
  it('can view a receive address on the wallet info', async () => {
    address = await expectAddressFromLatestMessage()
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
    await expectNthToLastMessageToMatch(3, /the following information about your wallet/)
    await expectLatestBalanceToMatch(REGEX_BALANCE_ZERO, new RegExp(`${receiveAmountFixed} 000 000`))
    await expectNthToLastMessageToMatch(1, /Your wallet was involved in 1 transactions/)
    await expectNthToLastMessageToMatch(0, /You can start recovering your wallet now/)
  })

  it('can see an updated confirmed balance after a block is mined', async () => {
    await client.mineBlocks(1)
    await sleepForBitcoinNetwork()
    await fetchWalletInfo()
    await expectLatestBalanceToMatch(new RegExp(`${receiveAmountFixed} 000 000`))
  })

  let changeAmount: number
  let changeAmountFixed: string
  it('can receive sats to a change address', async () => {
    await inputs.receive.clear()
    await inputs.receive.sendKeys(changeDescriptor)
    await fetchWalletInfo()
    const address = await expectAddressFromLatestMessage()
    changeAmount = getRandom(10, 2000) / 100
    changeAmountFixed = changeAmount.toFixed(2)
    await client.sendToAddressAndConfirm(address, changeAmount)
    await fetchWalletInfo()
    await expectLatestBalanceToMatch(new RegExp(`${changeAmountFixed} 000 000`))
  })

  let fullWalletBalance: number
  let fullWalletBalanceFixed: string
  it('can use the receive descriptor only to see the balance of both receive and change', async () => {
    await inputs.receive.clear()
    await inputs.receive.sendKeys(receiveDescriptor)
    fullWalletBalance = receiveAmount + changeAmount
    fullWalletBalanceFixed = fullWalletBalance.toFixed(2)
    await fetchWalletInfo()
    await expectLatestBalanceToMatch(new RegExp(`${fullWalletBalanceFixed} 000 000`))
  })

  it('can toggle the visibility of the change descriptor field', async () => {
    expect(await inputs.change.isDisplayed()).toBe(false)
    await inputs.changeCheckbox.click()
    await waitForUI()
    expect(await inputs.change.isDisplayed()).toBe(true)
  })

  it('can see the receive balance only when auto-change is disabled', async () => {
    await fetchWalletInfo()
    await expectLatestBalanceToMatch(new RegExp(`${receiveAmountFixed} 000 000`))
  })

  it('can restore auto-change to see the full balance', async () => {
    await inputs.changeCheckbox.click()
    await waitForUI()
    expect(await inputs.change.isDisplayed()).toBe(false)
    await fetchWalletInfo()
    await expectLatestBalanceToMatch(new RegExp(`${fullWalletBalanceFixed} 000 000`))
  })

  it('can begin the recovery', async () => {
    const beginRecoveryButton = await driver.findElement(By.id('begin-recovery-btn'))
    await beginRecoveryButton.click()
    await waitForUI()
    await expectCardCollapseState(inputs.walletConfigurationCollapse, false)
    await expectCardCollapseState(inputs.recoveryOptionsCollapse, true)
    await expectCardCollapseState(inputs.sendTransactionCollapse, false)
  })

  it('can input an invalid address and see an invalid address message', async () => {
    await inputs.address.sendKeys('invalidAddress')
    await waitForUI()

    expect(await outputs.addressInputValidationMessage.getText()).toMatch(/This address is not valid/)
  })

  it('can input an valid address and see a valid address message', async () => {
    await inputs.address.clear()
    await inputs.address.sendKeys(destinationAddress)
    await waitForUI()

    expect(await outputs.addressInputValidationMessage.getText()).toMatch(/This address looks good/)
  })

  let psbt: string
  it('can get a PSBT for signing without inserting a fee rate', async () => {
    const feeText = await inputs.feeRate.getText()
    expect(feeText).toBe('')
    psbt = await inputs.psbt.getAttribute('value')
    expect(psbt).toBe('')

    await inputs.sweep.click()
    await waitForUI()
    expect(await inputs.broadcast.getCssValue('pointer-events')).toBe('none') // broadcast button should be disabled
    expectNthToLastMessageToMatch(2, new RegExp(`Created a transaction to send [\\s\\S]+${destinationAddress}`))
    expectNthToLastMessageToMatch(1, /Applied a network fee of .*/)
    expectLatestMessageToMatch(/Verify the transaction details on the right carefully/)
  })

  it('can see the send transaction card', async () => {
    await waitForUI()
    await expectCardCollapseState(inputs.walletConfigurationCollapse, false)
    await expectCardCollapseState(inputs.recoveryOptionsCollapse, false)
    await expectCardCollapseState(inputs.sendTransactionCollapse, true)
    expect(await inputs.psbtToggle.isSelected()).toBe(false)
    expect(await inputs.psbt.isDisplayed()).toBe(false)
    expect(await inputs.copy.isDisplayed()).toBe(false)
    expect(await inputs.paste.isDisplayed()).toBe(false)
  })

  it('can reveal the PSBT field with the toggle', async () => {
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
    await sleepForBitcoinNetwork()
    await waitForUI()
    await expectNthToLastMessageToMatch(1, /Transaction successfully broadcasted/)
    await expectNthToLastMessageToMatch(0, /Your transaction should be visible in your wallet shortly/)
  })

  it('switches back to wallet configuration', async () => {
    await inputs.walletConfigurationCollapse.click()
  })

  it('can see the balance updated after the transaction is broadcast', async () => {
    await sleepForBitcoinNetwork()
    await fetchWalletInfo()
    await expectNthToLastMessageToMatch(0, /The wallet is currently empty but has 3 transactions/)
  })

  it('can see the unconfirmed balance on the target wallet', async () => {
    await inputs.receive.clear()
    await inputs.receive.sendKeys(destinationDescriptor)
    await fetchWalletInfo()
    await expectLatestBalanceToMatch(REGEX_BALANCE_ZERO, REGEX_BALANCE_NONZERO)
  })

  it('can see the confirmed balance on the target wallet after a block is mined', async () => {
    await client.mineBlocks(1)
    await sleepForBitcoinNetwork()
    await fetchWalletInfo()
    await expectLatestBalanceToMatch(REGEX_BALANCE_NONZERO)
  })

  it.skip("sleeps so I can see what's going on", async () => {
    await sleep(30000)
  })
})
