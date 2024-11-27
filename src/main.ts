import { readText as fromClipboard, writeText as toClipboard } from '@tauri-apps/plugin-clipboard-manager'
import { commands } from './bindings'
import { Address, RecoveryToast, Success, Transactions, WalletInfo } from './components'
import { clearStatusIndicators, DOM, getUserInputs, handleError, initializeDOM } from './dom'
import {
  Device,
  getDevice,
  getDeviceMessage,
  getDevicePrompt,
  getPsbtStatusMessage,
  getSignResultAndPsbt,
  sanitize,
} from './parsing'
import { capitalize, createConversationBubble, populateTransactionOverview, scrollToLastMessage } from './utilities'
import { validateAddress, validateDescriptor, validatePsbt } from './validate'
import { closeToast, showToast } from './toast'

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

const updateSignHistory = (device: Device) => {
  const newStep = document.createElement('li')
  newStep.classList.add('step', 'step-info')
  newStep.innerHTML = `Signed by ${capitalize(device.type)} device (${device.fingerprint})`
  const stepsList = DOM.outputs.psbtSignHistory
  stepsList.appendChild(newStep)
}

function require(value: unknown, itemName: string) {
  if (!value) {
    const message = itemName.concat(' is required')
    DOM.outputs.tempMessage.textContent = message
    throw new Error(message)
  }
}

async function broadcast() {
  const { descriptors, electrum, network, psbt } = getUserInputs()
  const isValid = await validateDescriptor()
  if (!isValid) return
  require(psbt, 'PSBT')

  DOM.outputs.tempMessage.textContent = 'Please wait...'
  try {
    const userBubble = createConversationBubble('Broadcast the transaction from this PSBT', true)
    DOM.outputs.conversation.appendChild(userBubble)
    await commands.broadcast(psbt, network, descriptors, electrum)
    const tempuraBubble = createConversationBubble('Broadcast successful!')
    DOM.outputs.conversation.appendChild(tempuraBubble)
    DOM.outputs.tempMessage.textContent = 'Anything else?'
  } catch (e: unknown) {
    handleError(e)
  }
}

async function enumerate() {
  const { network } = getUserInputs()

  DOM.outputs.tempMessage.textContent = 'Please wait... (be sure to check attached device for prompts)'
  try {
    const userBubble = createConversationBubble('Find my device', true)
    DOM.outputs.conversation.appendChild(userBubble)
    const response = await commands.enumerate(network)
    const tempuraBubble = createConversationBubble(getDeviceMessage(response))
    DOM.outputs.conversation.appendChild(tempuraBubble)
    DOM.outputs.tempMessage.textContent = getDevicePrompt(response)
  } catch (e: unknown) {
    handleError(e)
  }
}

async function loadWallet() {
  const { descriptors, electrum, network } = getUserInputs()
  const isValid = await validateDescriptor()
  if (!isValid) return
  DOM.outputs.tempMessage.textContent = 'Fetching wallet ...'

  try {
    const userBubble = createConversationBubble('Fetch my wallet.', true)
    DOM.outputs.conversation.appendChild(userBubble)
    const { balance, transactions } = await commands.wallet(network, descriptors, electrum)
    DOM.outputs.txBody.innerHTML = Transactions(transactions)
    DOM.outputs.tempMessage.textContent = 'Wallet fetched successfully!'
    const tempuraBubble = createConversationBubble(
      WalletInfo({
        balance,
        transactions,
      })
    )
    DOM.outputs.conversation.appendChild(tempuraBubble)

    const showListButton = tempuraBubble.querySelector('#show-transactions-btn')
    showListButton?.addEventListener('click', () => {
      DOM.outputs.txModal.showModal()
    })

    // Show toast message from which to start recovery flow
    showToast(RecoveryToast())
    const beginRecoveryButton = document.getElementById('begin-recovery-btn')
    beginRecoveryButton?.addEventListener('click', () => {
      DOM.containers.recovery.classList.remove('hidden')
      DOM.containers.recovery.scrollIntoView({ behavior: 'smooth' })
      closeToast()
    })

    instrumentCopyButtons(DOM.outputs.txBody)
  } catch (e: unknown) {
    handleError(e)
  }
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

async function getAddress() {
  const {
    descriptors: { receive },
    electrum,
    network,
  } = getUserInputs()
  const isValid = await validateDescriptor()
  if (!isValid) return
  DOM.outputs.tempMessage.textContent = 'Fetching the next unused address for you ...'
  try {
    const userBubble = createConversationBubble('Give me an address!', true)
    DOM.outputs.conversation.appendChild(userBubble)
    const { address } = await commands.address(network, receive, electrum)
    DOM.outputs.tempMessage.textContent = 'Address retrieved successfully!'
    const tempuraBubble = createConversationBubble(Address({ address }))
    DOM.outputs.conversation.appendChild(tempuraBubble)
    instrumentCopyButtons(tempuraBubble)
  } catch (e: unknown) {
    handleError(e)
  }
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
  DOM.outputs.tempMessage.textContent = 'Please wait...'
  try {
    const { electrum, network } = getUserInputs()
    const feeRate = await commands.estimateFee(network, electrum, 1)
    DOM.inputs.feeRate.value = feeRate.toString()
    DOM.outputs.tempMessage.innerHTML = Success('Fee retrieved')
  } catch (e: unknown) {
    handleError(e)
  }
}

function pastePsbtFromClipboard() {
  fromClipboard()
    .then((psbt) => {
      const trimmed = psbt.trim()
      if (trimmed !== DOM.outputs.psbtTextArea.value) {
        DOM.buttons.broadcast.classList.remove('btn-disabled')
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

function showChangeInput() {
  if (DOM.checkboxes.change.checked) {
    DOM.containers.change.classList.add('hidden')
  } else {
    DOM.containers.change.classList.remove('hidden')
  }
}

function showElectrumInput() {
  if (DOM.checkboxes.electrum.checked) {
    DOM.containers.electrum.classList.add('hidden')
  } else {
    DOM.containers.electrum.classList.remove('hidden')
  }
}

function showNetworkInput() {
  if (DOM.checkboxes.network.checked) {
    DOM.containers.network.classList.add('hidden')
  } else {
    DOM.containers.network.classList.remove('hidden')
  }
}

async function sign() {
  const { psbt, descriptors, network } = getUserInputs()
  require(psbt, 'PSBT')

  DOM.outputs.tempMessage.textContent = 'Please wait... Make sure your device is unlocked (PIN entered).'
  try {
    const userBubble = createConversationBubble('Sign this transaction (PSBT)', true)
    DOM.outputs.conversation.appendChild(userBubble)
    const enumeration = await commands.enumerate(network)
    const device = getDevice(enumeration)
    DOM.outputs.tempMessage.textContent =
      'Follow the instructions on your device (might take a few seconds for them to appear).'
    const response = await commands.sign(psbt, network, device.type)
    const { psbt: responsePsbt, message, signed } = getSignResultAndPsbt(response)
    DOM.outputs.psbtTextArea.value = responsePsbt
    const tempuraBubble = createConversationBubble(message)
    DOM.outputs.conversation.appendChild(tempuraBubble)
    validatePsbt()
    if (signed) {
      updateSignHistory(device)
    }
    // Give feedback via shrimpy
    const psbtStatus = await commands.psbtStatus(responsePsbt, network, descriptors)
    DOM.outputs.tempMessage.textContent = getPsbtStatusMessage(psbtStatus)
  } catch (e: unknown) {
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
  }
  require(address, 'Address')

  const feeRate = await getFeeRate()
  if (feeRate.failed || feeRate.value === null) {
    DOM.outputs.tempMessage.textContent =
      'Unable to automatically estimate a fee for this network. Please enter a fee rate manually.'
    return
  }

  DOM.outputs.tempMessage.textContent = 'Please wait...'
  try {
    const userBubble = createConversationBubble(
      `Create a transaction (PSBT) sending all wallet funds to <span class="break-all font-bold">${sanitize(address)}</span> (fee rate: ${feeRate.value} sats/vB)`,
      true
    )
    DOM.outputs.conversation.appendChild(userBubble)
    const { psbt, outbound, fee } = await commands.sweep(address, feeRate.value, network, descriptors, electrum)
    clearStatusIndicators(DOM.outputs.psbtTextArea)
    // Show transaction overview and populate transaction overview table
    DOM.outputs.transactionOverview.classList.remove('hidden')
    populateTransactionOverview({ address: DOM.inputs.address.value, outbound, fee })
    // Populate PSBT textarea even though it may not be shown
    DOM.outputs.psbtTextArea.value = psbt
    validatePsbt()

    // Show and scroll to transaction area
    DOM.outputs.transactionOverview.scrollIntoView({ behavior: 'smooth' })

    DOM.outputs.tempMessage.textContent = 'Sign next?'
    const tempuraBubble = createConversationBubble(Success('Transaction (PSBT) created!'))
    DOM.outputs.conversation.appendChild(tempuraBubble)

    if (feeRate.warning) {
      const warningBubble = createConversationBubble(feeRate.warning)
      DOM.outputs.conversation.appendChild(warningBubble)
    }
  } catch (e: unknown) {
    handleError(e)
  }
}

window.addEventListener('DOMContentLoaded', () => {
  initializeDOM()

  DOM.buttons.address.addEventListener('click', (e) => {
    e.preventDefault()
    getAddress()
  })

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

  DOM.buttons.estimate.addEventListener('click', (e) => {
    e.preventDefault()
    estimateFee()
  })

  DOM.buttons.load.addEventListener('click', (e) => {
    e.preventDefault()
    loadWallet()
  })

  DOM.buttons.pastePsbt.addEventListener('click', (e) => {
    e.preventDefault()
    pastePsbtFromClipboard()
  })

  DOM.buttons.sign.addEventListener('click', (e) => {
    e.preventDefault()
    sign()
  })

  DOM.buttons.sweep.addEventListener('click', (e) => {
    e.preventDefault()
    sweep()
  })

  DOM.checkboxes.change.addEventListener('click', showChangeInput)
  DOM.checkboxes.electrum.addEventListener('click', showElectrumInput)
  DOM.checkboxes.network.addEventListener('click', showNetworkInput)

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
    DOM.buttons.broadcast.classList.remove('btn-disabled')
    DOM.outputs.psbtSignHistory.innerHTML = ''
    validatePsbt()
  })

  DOM.links.about.addEventListener('click', async (e) => {
    e.preventDefault()
    await commands.createWindow('about', 'about.html', 'About Tempura', 800, 600)
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
