import { readText as fromClipboard, writeText as toClipboard } from '@tauri-apps/plugin-clipboard-manager'
import { commands } from './bindings'
import { Transactions } from './components'
import { clearStatusIndicators, DOM, getUserInputs, handleError, initializeDOM, initializeMode } from './dom'
import {
  Device,
  getDevice,
  getDeviceMessage,
  getDevicePrompt,
  getPsbtStatusMessage,
  getSignResultAndPsbt,
  sanitize,
} from './parsing'
import {
  createConversationBubble,
  getWalletInfoBubbles,
  hideTempMessage,
  populateTransactionOverview,
  scrollToLastMessage,
  showTempLoadingMessage,
  addToConversation,
  ConversationBubbleProps,
} from './utilities'
import { validateAddress, validateDescriptor, validatePsbt } from './validate'
import { createConversationActions } from './utilities/createConversationActions'
import { getTransactionCreatedBubbles } from './utilities/getTransactionCreatedBubbles'
import { getJadeDevice, getDeviceName } from './utilities/devices'
import { createConversationImage } from './utilities/createConversationImage'
import { CircularTickIcon } from './icons/circularTick'

const FEE_RATE_WARNING_RATIO = 0.9

type FeeRate = {
  value: number | null
  warning?: string
  failed?: boolean
}

/**
 * fetches a fee rate estimate from the network and compares it to the user input
 * if there is one. If there is no user input, the estimate is returned.
 */
async function getFeeRate(): Promise<FeeRate> {
  const { feeRate, network, electrum } = getUserInputs()

  let estimate: number
  try {
    estimate = await commands.estimateFee(network, electrum, 1)
  } catch {
    const failed = feeRate === null
    const warning = failed
      ? undefined
      : 'Warning: The specified fee rate could not be checked \
      against the current network rates. Please double-check \
      this is the value you wish to use!'
    return { value: feeRate, warning, failed }
  }

  if (typeof feeRate !== 'number') {
    return { value: estimate }
  }
  if (feeRate < estimate * FEE_RATE_WARNING_RATIO) {
    return {
      value: feeRate,
      warning:
        'Warning: The specified fee rate is lower than recommended. \
        Please double-check this value. Low fee rates may \
        cause delays in transaction confirmation.',
    }
  }
  return { value: feeRate }
}

const addSignatureToSignHistory = (device: Device) => {
  const newSignature = document.createElement('li')
  newSignature.className = 'border rounded-md p-2 bg-success/10 border-success flex group gap-2 text-success'

  const icon = CircularTickIcon
  newSignature.innerHTML = `${icon}<div class="flex flex-col"><span class="text-success-content">${getDeviceName(device)}</span><span class="text-sm text-success-content/70">${device.fingerprint}</span></div>`

  return newSignature
}

const updateSignHistory = (device: Device) => {
  const newSignature = addSignatureToSignHistory(device)
  const stepsList = DOM.outputs.psbtSignHistory

  const missingSignature = stepsList.querySelector('#missing-signature')
  if (missingSignature) {
    stepsList.insertBefore(newSignature, missingSignature)
  } else {
    stepsList.appendChild(newSignature)
  }
}

function require(value: unknown, message: string, errorElement: HTMLElement) {
  if (value) {
    errorElement.textContent = ''
    return
  }

  errorElement.textContent = message
  throw new Error(message)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function broadcast() {
  const { descriptors, electrum, network, psbt } = getUserInputs()
  const isValid = await validateDescriptor()
  if (!isValid) return
  require(psbt, 'PSBT is required', DOM.feedback.psbtInputValidationMessage)

  DOM.outputs.tempMessage.textContent = 'Please wait...'
  try {
    const userBubble = createConversationBubble({
      content: 'Broadcast the transaction to the Bitcoin network',
      isUserSpeaking: true,
    })

    addToConversation(userBubble)
    await commands.broadcast(psbt, network, descriptors, electrum)

    await sleep(500)

    showTempLoadingMessage('Broadcasting transaction...')
    await sleep(2000)

    hideTempMessage()
    addToConversation(
      createConversationBubble({
        content: 'Transaction successfully broadcasted.',
        footer: new Date().toLocaleString(),
      })
    )

    await sleep(500)

    addToConversation(
      createConversationBubble({
        content: 'Your transaction should be visible in your wallet shortly and confirmed in the next few blocks.',
      })
    )

    /*
    addToConversation(createConversationActions({
      content: '<button class="btn btn-outline btn-sm" id="broadcast-again-btn">View in mempool</button>',
    })
    */

    //DOM.outputs.tempMessage.textContent = 'Anything else?'
  } catch (e: unknown) {
    handleError(e)
  }
}

async function enumerate() {
  const { network } = getUserInputs()

  DOM.outputs.tempMessage.textContent = 'Please wait... (be sure to check attached device for prompts)'
  try {
    const userBubble = createConversationBubble({
      content: 'Find my device',
      isUserSpeaking: true,
    })
    addToConversation(userBubble)
    const response = await commands.enumerate(network)
    const tempuraBubble = createConversationBubble({
      content: getDeviceMessage(response),
    })

    addToConversation(tempuraBubble)
    DOM.outputs.tempMessage.textContent = getDevicePrompt(response)
  } catch (e: unknown) {
    handleError(e)
  }
}

async function loadWallet() {
  const { descriptors, electrum, network } = getUserInputs()
  const isValid = await validateDescriptor()
  if (!isValid) return

  showTempLoadingMessage('Fetching wallet')

  try {
    const userBubble = createConversationBubble({
      content: 'Fetch my wallet.',
      isUserSpeaking: true,
    })
    addToConversation(userBubble)
    showTempLoadingMessage('Fetching wallet')
    const { balance, transactions } = await commands.wallet(network, descriptors, electrum)
    const addressInfo = await commands.address(network, descriptors, electrum)
    DOM.outputs.txBody.innerHTML = Transactions(transactions)

    hideTempMessage()

    /*
    const balanceInfoBubble = createConversationBubble({
      content: 'I found the following information about your wallet',
    })
      */

    const { messages: walletInfoBubbles, isRecoverable } = getWalletInfoBubbles({
      // balance: { immature: '0', confirmed: '0', trusted_pending: '0', untrusted_pending: '0' },
      balance,
      transactions,
      addressInfo,
    })

    if (!walletInfoBubbles || !walletInfoBubbles.length) {
      const couldNotFindWalletInfoBubble = createConversationBubble({
        content: 'I could not find any information about your wallet',
      })
      addToConversation(couldNotFindWalletInfoBubble)
      return
    }

    for (const bubble of walletInfoBubbles) {
      const tempuraItem = bubble.type === 'bubble' ? createConversationBubble(bubble) : createConversationActions(bubble)
      if (!tempuraItem) {
        continue
      }

      if (bubble.type === 'actions') {
        const showListButton = tempuraItem.querySelector('#show-transactions-btn')
        showListButton?.addEventListener('click', () => {
          DOM.modals.transactions.showModal()
          instrumentCopyButtons(DOM.outputs.txBody)
        })

        instrumentStartRecoveryButton(tempuraItem)
      }

      // other message types that contain copy buttons, such as address display
      instrumentCopyButtons(tempuraItem)

      addToConversation(tempuraItem)

      await sleep(400)
    }

    if (!isRecoverable) {
      return
    }
  } catch (e: unknown) {
    handleError(e)
  }
}

function instrumentStartRecoveryButton(parent: HTMLElement) {
  const beginRecoveryButton = parent.querySelector('#begin-recovery-btn')

  if (!beginRecoveryButton) {
    return
  }

  beginRecoveryButton.addEventListener('click', async () => {
    const isChecked = DOM.radios.recoveryOptionsCollapse.checked

    if (isChecked) {
      return
    }

    // only show this message once
    const addDestinationAddressMessage = createConversationBubble({
      content:
        'Recovering is simple. Add an address in the input on the right. We create a recovery transaction and send the funds to that address next.',
      isUserSpeaking: false,
    })

    addToConversation(addDestinationAddressMessage)

    await sleep(1000)

    DOM.radios.recoveryOptionsCollapse.checked = true
  })
}

function instrumentCopyButtons(parent: HTMLElement) {
  parent.querySelectorAll<HTMLButtonElement>('button[name=copy]').forEach((copyButton) => {
    copyButton.addEventListener('click', () => {
      toClipboard(copyButton.getAttribute('value') ?? '')
        .then(() => {
          // Change the tooltip text
          const tooltip = copyButton.closest('.tooltip')
          tooltip?.setAttribute('data-tip', 'Copied')

          // Show a checkmark within the copy icon
          const copyIcon = copyButton.querySelector('#copy-icon')
          copyIcon?.classList.add('copied') // animation effect
          const checkmark = copyIcon?.querySelector('#checkmark')
          checkmark?.classList.remove('hidden')

          // Reset after delay
          setTimeout(() => {
            tooltip?.setAttribute('data-tip', 'Copy')
            checkmark?.classList.add('hidden')
            copyIcon?.classList.remove('copied')
          }, 2000)
        })
        .catch(() => {
          DOM.outputs.tempMessage.textContent = `Failed to copy ${copyButton.getAttribute('value')} to clipboard`
        })
    })
  })
}

function copyPsbtToClipboard() {
  const psbt = DOM.outputs.psbtTextArea.value.trim()
  if (!psbt) {
    DOM.outputs.tempMessage.textContent = 'No PSBT to copy'
    return
  }

  toClipboard(psbt)
    .then(() => {
      DOM.outputs.tempMessage.textContent = 'PSBT copied to clipboard'
    })
    .catch((e) => {
      console.log('Failed to copy PSBT to clipboard', e)
      DOM.outputs.tempMessage.textContent = 'Failed to copy PSBT to clipboard'
    })
}

async function estimateFee() {
  //showTempLoadingMessage('Estimating fee')

  try {
    const { electrum, network } = getUserInputs()
    DOM.buttons.estimate.classList.add('is-loading')
    const feeRate = await commands.estimateFee(network, electrum, 1)
    DOM.buttons.estimate.classList.remove('is-loading')
    DOM.inputs.feeRate.value = feeRate.toString()
    // showTempMessage('Fee retrieved')
  } catch (e: unknown) {
    handleError(e)
  }
}

function pastePsbtFromClipboard() {
  fromClipboard()
    .then((psbt) => {
      const trimmed = psbt.trim()
      if (trimmed !== DOM.outputs.psbtTextArea.value) {
        DOM.buttons.broadcast.classList.remove('btn-disabled', 'hidden')
        DOM.outputs.psbtStatus.innerHTML = ''
        DOM.outputs.psbtSignHistory.innerHTML = ''
      }

      DOM.outputs.tempMessage.textContent = 'PSBT pasted from your clipboard'
      DOM.outputs.psbtTextArea.value = trimmed
      validatePsbt()
    })
    .catch((e) => {
      console.log('Failed to paste PSBT from clipboard', e)
      DOM.outputs.tempMessage.textContent = 'Failed to copy PSBT to clipboard'
    })
}

const toggleChangeInput = () => DOM.containers.change.classList.toggle('hidden', DOM.checkboxes.change.checked)
const toggleElectrumInput = () => DOM.containers.electrum.classList.toggle('hidden', DOM.checkboxes.electrum.checked)
const toggleFeeRateInput = () => DOM.containers.feeRate.classList.toggle('hidden', DOM.checkboxes.feeRate.checked)
const toggleNetworkInput = () => DOM.containers.network.classList.toggle('hidden', DOM.checkboxes.network.checked)

async function sign({ retryCount = 0 }: { retryCount?: number } = {}) {
  const { psbt, descriptors, network } = getUserInputs()
  require(psbt, 'PSBT is required', DOM.feedback.psbtInputValidationMessage)

  //showTempMessage('Please wait... Make sure your device is unlocked (PIN entered).')
  try {
    showTempLoadingMessage('Looking for your device…')

    await sleep(400)

    const enumeration = await commands.enumerate(network)
    const device = getDevice(enumeration)

    hideTempMessage()

    const deviceInstructionBubbles: Array<ConversationBubbleProps & { type: 'bubble' | 'image' }> = [
      ...(device.type === 'jade'
        ? [
            {
              content: getJadeDevice({ fingerprint: device.fingerprint ?? '' }),
              type: 'image' as const,
            },
            {
              content: `Found your ${getDeviceName(device)}. Verify the transaction on the screen, it may take a few seconds to appear.`,
              footer: new Date().toLocaleString(),
              type: 'bubble' as const,
            },
          ]
        : [
            {
              content: `Found a ${device.type} with fingerprint ${device.fingerprint}.`,
              type: 'bubble' as const,
            },
            {
              content: `Follow the instructions on your ${getDeviceName(device)}. It may take a few seconds for them to appear.`,
              type: 'bubble' as const,
            },
          ]),
    ]

    for (const { type, ...bubble } of deviceInstructionBubbles) {
      const item = type === 'image' ? createConversationImage(bubble) : createConversationBubble(bubble)
      addToConversation(item)
      await sleep(400)
    }

    // let them read past messages first.
    // give the device some time to receive the psbt.
    // then notify that we're waiting
    await sleep(9000)

    showTempLoadingMessage('Waiting for you to sign the transaction')

    const response = await commands.sign(psbt, network, device.type)

    hideTempMessage()

    const { psbt: responsePsbt, message, signed } = getSignResultAndPsbt(response)
    DOM.outputs.psbtTextArea.value = responsePsbt
    const tempuraBubble = createConversationBubble({
      content: message,
      //footer: new Date().toLocaleString(),
      dangerouslySetInnerHTML: true,
    })
    addToConversation(tempuraBubble)
    validatePsbt()
    if (signed) {
      updateSignHistory(device)
    }

    // Give feedback via shrimpy
    const psbtStatus = await commands.psbtStatus(responsePsbt, network, descriptors)

    await sleep(600)

    addToConversation(
      createConversationBubble({
        content: getPsbtStatusMessage(psbtStatus),
        footer: new Date().toLocaleString(),
      })
    )

    if (psbtStatus === 'PartiallySigned') {
      await sleep(4000)
      addToConversation(
        createConversationBubble({
          content: 'Connect another device to continue signing the transaction.',
        })
      )
      const actions = createConversationActions({
        content: '<button class="btn btn-primary btn-sm">Continue signing with another device</button>',
        dangerouslySetInnerHTML: true,
        onAppended: (parent) => {
          parent.querySelector('button')?.addEventListener('click', () => {
            sign()
          })
        },
      })

      if (actions) {
        addToConversation(actions)
      }
    }
  } catch (e: unknown) {
    if (e instanceof Error) {
      const tryAgainActions = createConversationActions({
        content: `<button class="btn btn-outline btn-sm" id="get-device-and-sign-again-btn">Try again</button>`,
        dangerouslySetInnerHTML: true,
        onAppended: (parent) => {
          parent.querySelector('#get-device-and-sign-again-btn')?.addEventListener('click', () => {
            sign({ retryCount: retryCount + 1 })
          })
        },
      })

      if (e.message.toLowerCase() === 'no devices found') {
        hideTempMessage()

        addToConversation(
          createConversationBubble({
            content:
              retryCount > 3
                ? 'If you have trouble connecting to your device please try a different USB port or cable.'
                : 'No devices found. Please make sure your device is plugged in and unlocked (PIN entered).',
            footer: new Date().toLocaleString(),
          }),
          {
            shouldScrollToLastMessage: !tryAgainActions,
          }
        )
      }

      // user likely canceled signing
      if (e.message.toLowerCase().includes('failed to extract psbt')) {
        hideTempMessage()

        addToConversation(
          createConversationBubble({
            content: `Looks like you refused to sign this transaction. If this was a mistake, you can try again.`,
          }),
          {
            shouldScrollToLastMessage: !tryAgainActions,
          }
        )
      }

      await sleep(400)

      if (tryAgainActions) {
        addToConversation(tryAgainActions, {
          shouldScrollToLastMessage: true,
        })
      }
      return
    }

    handleError(e)
  }
}

async function sweep() {
  const inputs = getUserInputs()

  const { address, descriptors, electrum, network } = inputs
  const isValid = await validateDescriptor()
  if (!isValid) return

  if (!address) {
    DOM.inputs.address.classList.add('input-error')
  } else {
    DOM.inputs.address.classList.remove('input-error')
  }

  require(address, 'A destination address is required', DOM.feedback.addressInputValidationMessage)

  const { feeRate: userFeeRate } = getUserInputs()
  const feeRate = await getFeeRate()

  if (feeRate.failed || feeRate.value === null) {
    DOM.outputs.tempMessage.textContent =
      'Unable to automatically estimate a fee for this network. Please enter a fee rate manually.'
    return
  }

  DOM.outputs.tempMessage.textContent = 'Please wait...'

  try {
    const createTransactionMessage = !userFeeRate
      ? `Create a transaction to send all wallet funds to <br/><span class="break-all font-bold">${sanitize(address)}</span>`
      : `Create a transaction to send all wallet funds to <span class="break-all font-bold">${sanitize(address)}</span> with a network fee rate of ${feeRate.value} sats/vB.`

    const userBubble = createConversationBubble({
      content: createTransactionMessage,
      //content: `Create a transaction to send all wallet funds to <span class="break-all font-bold">${sanitize(address)}</span> with a network fee rate of ${feeRate.value} sats/vB.`,
      //content: `Create a transaction (PSBT) sending all wallet funds to <span class="break-all font-bold">${sanitize(address)}</span> with a network fee rate of ${feeRate.value} sats/vB.`,
      isUserSpeaking: true,
      dangerouslySetInnerHTML: true,
    })

    addToConversation(userBubble)
    const psbtDetails = await commands.sweep(address, feeRate.value, network, descriptors, electrum)
    const { psbt, outbound, sent, fee } = psbtDetails

    await sleep(1000)
    clearStatusIndicators(DOM.outputs.psbtTextArea)

    const { messages: replies } = getTransactionCreatedBubbles({
      sent,
      address,
      hasUserFeeRate: !!userFeeRate,
      feeRate: fee,
    })

    for (const reply of replies) {
      const tempuraBubble = createConversationBubble(reply)
      addToConversation(tempuraBubble)
      await sleep(400)
    }

    // Show transaction overview and populate transaction overview table
    DOM.outputs.transactionOverview.classList.remove('hidden')
    populateTransactionOverview({ address: DOM.inputs.address.value, outbound, fee })
    // Populate PSBT textarea even though it may not be shown
    DOM.outputs.psbtTextArea.value = psbt
    validatePsbt()

    // Show and scroll to transaction area
    DOM.outputs.transactionOverview.scrollIntoView({ behavior: 'smooth' })

    DOM.outputs.tempMessage.textContent = 'Sign next?'

    if (feeRate.warning) {
      const warningBubble = createConversationBubble({
        content: feeRate.warning,
      })
      addToConversation(warningBubble)
    }

    DOM.radios.sendTransactionCollapse.checked = true
  } catch (e: unknown) {
    handleError(e)
  }
}

window.addEventListener('DOMContentLoaded', () => {
  initializeMode()
  initializeDOM()

  DOM.buttons.broadcast.addEventListener('click', (e) => {
    e.preventDefault()
    broadcast()
  })

  DOM.buttons.copyPsbt.addEventListener('click', (e) => {
    e.preventDefault()
    copyPsbtToClipboard()
  })

  DOM.buttons.enumerate.addEventListener('click', (e) => {
    e.preventDefault()
    enumerate()
  })

  DOM.buttons.advancedMode.addEventListener('click', (e) => {
    e.preventDefault()
    document.documentElement.classList.toggle('advanced-mode')
  })

  DOM.buttons.estimate.addEventListener('click', (e) => {
    e.preventDefault()
    estimateFee()
  })

  DOM.buttons.load.addEventListener('click', (e) => {
    e.preventDefault()
    loadWallet()
  })

  DOM.buttons.modals.autoChange.addEventListener('click', (e) => {
    e.preventDefault()
    DOM.modals.autoChange.showModal()
  })

  DOM.buttons.modals.autoElectrum.addEventListener('click', (e) => {
    e.preventDefault()
    DOM.modals.autoElectrum.showModal()
  })

  DOM.buttons.modals.electrumServer.addEventListener('click', (e) => {
    e.preventDefault()
    DOM.modals.electrumServer.showModal()
  })

  DOM.buttons.modals.feeRate.addEventListener('click', (e) => {
    e.preventDefault()
    DOM.modals.feeRate.showModal()
  })

  DOM.buttons.modals.network.addEventListener('click', (e) => {
    e.preventDefault()
    DOM.modals.network.showModal()
  })

  DOM.buttons.modals.walletConfig.addEventListener('click', (e) => {
    e.preventDefault()
    DOM.modals.walletConfig.showModal()
  })

  DOM.buttons.pastePsbt.addEventListener('click', (e) => {
    e.preventDefault()
    pastePsbtFromClipboard()
  })

  DOM.buttons.sign.addEventListener('click', async (e) => {
    e.preventDefault()
    const userBubble = createConversationBubble({
      content: 'Sign this transaction (PSBT)',
      isUserSpeaking: true,
    })
    addToConversation(userBubble)

    await sleep(400)

    addToConversation(
      createConversationBubble({
        content:
          'To sign the transaction, we need to find your device. Make sure it is plugged in and unlocked (PIN entered).',
        isUserSpeaking: false,
      })
    )

    await sleep(2000)

    sign()
  })

  DOM.buttons.sweep.addEventListener('click', (e) => {
    e.preventDefault()
    sweep()
  })

  DOM.checkboxes.change.addEventListener('click', toggleChangeInput)
  DOM.checkboxes.electrum.addEventListener('click', toggleElectrumInput)
  DOM.checkboxes.feeRate.addEventListener('click', toggleFeeRateInput)
  DOM.checkboxes.network.addEventListener('click', toggleNetworkInput)

  DOM.inputs.address.addEventListener('input', validateAddress)

  DOM.inputs.networkRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      DOM.inputs.address.value = ''
      clearStatusIndicators(DOM.inputs.address)
      validateDescriptor()
    })
  })

  // validation of descriptor
  DOM.inputs.receive.addEventListener('blur', () => {
    validateDescriptor()
    DOM.outputs.conversation.querySelectorAll('div.wallet-info').forEach((e) => {
      e.innerHTML = 'Outdated'
    })
  })

  DOM.inputs.receive.addEventListener('input', () => {
    DOM.inputs.receive.value = DOM.inputs.receive.value.replace(/\r?\n|\r/g, '').trim()
    validateDescriptor()
    DOM.outputs.conversation.querySelectorAll('div.wallet-info').forEach((e) => {
      e.innerHTML = 'Outdated'
    })
  })

  DOM.outputs.psbtTextArea.addEventListener('input', () => {
    DOM.buttons.broadcast.classList.remove('btn-disabled', 'hidden')
    DOM.outputs.psbtSignHistory.innerHTML = ''
    validatePsbt()
  })

  DOM.links.about.addEventListener('click', async (e) => {
    e.preventDefault()
    await commands.createWindow('about', 'about.html', 'About Swan Vault Recovery Assistant', 800, 950)
  })

  DOM.links.github.addEventListener('click', async (e) => {
    e.preventDefault()
    await commands.openGithubUrl()
  })

  // Set up observer to scroll to the last chat message whenever a message is added
  const config = { childList: true } // only observe the addition/removal of child nodes
  const callback = (mutationList: MutationRecord[]) => {
    for (const mutation of mutationList) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        scrollToLastMessage()
      }
    }
  }
  const observer = new MutationObserver(callback)
  observer.observe(DOM.outputs.conversation, config)

  // Clear messages via button click
  DOM.buttons.clearMessages.addEventListener('click', () => {
    DOM.outputs.conversation.innerHTML = ''
    DOM.outputs.tempMessage.textContent = 'All messages cleared 🫡'
    DOM.buttons.clearMessages.classList.add('hidden')
  })
})
