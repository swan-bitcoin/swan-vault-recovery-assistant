import { DOM, initializeDOM } from './dom'
import { readText as fromClipboard, writeText as toClipboard } from '@tauri-apps/plugin-clipboard-manager'
import { commands, Descriptors, type TempuraError } from './bindings'
import { Address, Balance, Success, Transactions } from './components'
import {
  capitalize,
  createConversationBubble,
  isChangeDescriptor,
  populateTransactionOverview,
  scrollToLastMessage,
} from './helpers'
import { simpleCheckmark } from './icons'
import { Device, getDevice, getDeviceMessage, getDevicePrompt, getPsbtStatusMessage, getSignResultAndPsbt } from './parsing'

const FEE_RATE_WARNING_RATIO = 0.9

function isTempuraError(e: unknown): e is TempuraError {
  const tempuraError = e as TempuraError
  return !!(tempuraError.error_type && tempuraError.message)
}

function handleError(e: unknown) {
  if (isTempuraError(e)) {
    console.log(e.error_type, e.message)
    DOM.outputs.tempMessage.textContent = e.error_type.concat(': ').concat(e.message)
    return
  }

  if (e instanceof Error) {
    console.error(e)
    DOM.outputs.tempMessage.textContent = e.message
    return
  }

  DOM.outputs.tempMessage.textContent = 'An unknown error occurred'
}

const validateDescriptor = async () => {
  const descriptor = DOM.inputs.receive.value
  const network = Array.from(DOM.inputs.networkRadios).find((radio) => radio.checked).value
  const standardWalletActions = document.getElementById('standard-wallet-actions')
  const recoveryOptionsCard = document.getElementById('recovery-options-card')

  if (!descriptor) {
    DOM.outputs.tempMessage.textContent = 'Wallet configuration is missing!'
    DOM.inputs.receive.classList.add('textarea-error')
    DOM.inputs.receive.classList.remove('textarea-success')
    DOM.inputs.receive.classList.remove('textarea-warning')
    return false
  }

  try {
    const isValidDescriptor = await commands.isDescriptorForNetwork(descriptor, network)
    if (!isValidDescriptor) {
      DOM.outputs.tempMessage.textContent =
        'Descriptor is fine but it is for the wrong network. Open the network settings to the right to change the network!'
      DOM.inputs.receive.classList.add('textarea-error')
      DOM.inputs.receive.classList.remove('textarea-success')
      DOM.inputs.receive.classList.remove('textarea-warning')
      return false
    }

    // Warning for change descriptor
    if (isChangeDescriptor(descriptor)) {
      DOM.outputs.tempMessage.textContent =
        'You seem to be using a change descriptor for your wallet configuration. This may limit wallet functionality, such as showing only a partial balance instead of the full wallet balance.'
      DOM.inputs.receive.classList.add('textarea-warning')
      DOM.inputs.receive.classList.remove('textarea-success')
      DOM.inputs.receive.classList.remove('textarea-error')
      recoveryOptionsCard.classList.remove('hidden')
      standardWalletActions.classList.remove('hidden')
      return true
    }

    // Descriptor is valid, show now wallet actions and recovery options card (one way switch)
    DOM.inputs.receive.classList.add('textarea-success')
    DOM.inputs.receive.classList.remove('textarea-error')
    DOM.inputs.receive.classList.remove('textarea-warning')
    DOM.outputs.tempMessage.textContent =
      'Your wallet configuration is valid. You can now fetch your balance and perform other actions.'
    recoveryOptionsCard.classList.remove('hidden')
    standardWalletActions.classList.remove('hidden')
    return true
  } catch (e: unknown) {
    console.error(e)
    DOM.outputs.tempMessage.textContent = 'Invalid wallet configuration!'
    DOM.inputs.receive.classList.add('textarea-error')
    DOM.inputs.receive.classList.remove('textarea-success')
    DOM.inputs.receive.classList.remove('textarea-warning')
    return false
  }
}

type FeeRate = {
  value: number | null
  warning?: string
  failed?: boolean
}

async function getFeeRate(): Promise<FeeRate> {
  const { feeRate, network, electrum } = getInputs()

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

type Inputs = {
  address: string
  descriptors: Descriptors
  electrum: string | null
  feeRate: number | null
  network: string
  psbt: string
}

function getInputs(): Inputs {
  const address = DOM.inputs.address.value.trim()
  const autoChange = DOM.checkboxes.change.checked
  const receive = DOM.inputs.receive.value.trim()
  const change = DOM.inputs.change?.value.trim() || null
  const electrum = DOM.inputs.electrum?.value.trim() || null
  const feeRate = Number(DOM.inputs.feeRate?.value.trim()) || null
  const network = Array.from(DOM.inputs.networkRadios).find((radio) => radio.checked).value
  const psbt = DOM.outputs.psbtTextArea.value.trim()

  return {
    address,
    descriptors: {
      receive,
      change,
      auto_change: autoChange,
    },
    electrum,
    feeRate,
    network,
    psbt,
  }
}

function require(value: unknown, itemName: string) {
  if (!value) {
    const message = itemName.concat(' is required')
    DOM.outputs.tempMessage.textContent = message
    throw new Error(message)
  }
}

async function broadcast() {
  const { descriptors, electrum, network, psbt } = getInputs()
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
  const { network } = getInputs()

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

async function getBalance() {
  const { descriptors, electrum, network } = getInputs()
  const isValid = await validateDescriptor()
  if (!isValid) return
  DOM.outputs.tempMessage.textContent = 'Fetching balance ...'

  try {
    const userBubble = createConversationBubble('What is my balance?', true)
    DOM.outputs.conversation.appendChild(userBubble)
    const balance = await commands.balance(network, descriptors, electrum)
    DOM.outputs.tempMessage.textContent = 'Balance fetched successfully!'
    const tempuraBubble = createConversationBubble(
      Balance({
        confirmed: balance.confirmed,
        unconfirmed: balance.untrusted_pending,
      })
    )
    DOM.outputs.conversation.appendChild(tempuraBubble)
  } catch (e: unknown) {
    handleError(e)
  }
}

function instrumentCopyButtons(parent: HTMLElement) {
  parent.querySelectorAll<HTMLButtonElement>('button[name=copy]').forEach((copyButton) => {
    copyButton.addEventListener('click', () => {
      toClipboard(copyButton.getAttribute('value'))
        .then(() => {
          // Change the tooltip text
          const tooltip = copyButton.closest('.tooltip')
          tooltip.setAttribute('data-tip', 'Copied')

          // Show a checkmark within the copy icon
          const copyIcon = copyButton.querySelector('#copy-icon')
          copyIcon.classList.add('copied') // animation effect
          const checkmark = copyIcon.querySelector('#checkmark')
          checkmark.classList.remove('hidden')

          // Reset after delay
          setTimeout(() => {
            tooltip.setAttribute('data-tip', 'Copy')
            checkmark.classList.add('hidden')
            copyIcon.classList.remove('copied')
          }, 2000)
        })
        .catch(() => {
          DOM.outputs.tempMessage.textContent = `Failed to copy ${copyButton.getAttribute('value')} to clipboard`
        })
    })
  })
}

async function getTransactions() {
  const { descriptors, electrum, network } = getInputs()
  const isValid = await validateDescriptor()
  if (!isValid) return
  DOM.outputs.tempMessage.textContent = 'Fetching transactions ...'

  try {
    const userBubble = createConversationBubble('Show me my transactions', true)
    DOM.outputs.conversation.appendChild(userBubble)
    const transactions = await commands.transactions(network, descriptors, electrum)
    DOM.outputs.txModal.showModal()
    DOM.outputs.txBody.innerHTML = Transactions(transactions)
    DOM.outputs.tempMessage.textContent = 'Transactions fetched successfully!'
    const tempuraBubble = createConversationBubble(
      `${transactions.length} transactions fetched <button class="btn btn-sm btn-link" id="show-transactions-btn">Show List</button>`
    )
    DOM.outputs.conversation.appendChild(tempuraBubble)
    // Add event listener for the "Show List" button
    const showListButton = tempuraBubble.querySelector('#show-transactions-btn')
    showListButton?.addEventListener('click', () => {
      DOM.outputs.txModal.showModal()
    })

    instrumentCopyButtons(DOM.outputs.txBody)
  } catch (e: unknown) {
    handleError(e)
  }
}

async function getAddress() {
  const {
    descriptors: { receive },
    electrum,
    network,
  } = getInputs()
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
    const { electrum, network } = getInputs()
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

function clearStatusIndicators(element: HTMLElement) {
  element.classList.remove('input-success')
  element.classList.remove('input-error')
  element.classList.remove('input-warning')
  element.classList.remove('textarea-success')
  element.classList.remove('textarea-error')
  element.classList.remove('textarea-warning')
}

async function validatePsbt() {
  const { psbt, network, descriptors } = getInputs()
  clearStatusIndicators(DOM.outputs.psbtTextArea)

  try {
    const isValid = await commands.isPsbt(psbt)
    if (!isValid) {
      DOM.outputs.psbtTextArea.classList.add('textarea-error')
      DOM.outputs.psbtStatus.innerHTML = `
      <span class="text-error">Invalid PSBT</span>
    `
      return
    }

    const psbtStatus = await commands.psbtStatus(psbt, network, descriptors)
    if (psbtStatus === 'FullySigned') {
      DOM.outputs.psbtTextArea.classList.add('textarea-success')
      DOM.outputs.psbtStatus.innerHTML = `
        <span class="text-success">Fully Signed ${simpleCheckmark}</span>
      `
      DOM.buttons.broadcast.classList.remove('btn-disabled')
    } else if (psbtStatus === 'PartiallySigned') {
      DOM.outputs.psbtStatus.innerHTML = `
        <span class="text-warning">Partially Signed</span>
      `
    } else if (psbtStatus === 'Unsigned') {
      DOM.outputs.psbtStatus.innerHTML = `
        <span class="text-neutral-500">Unsigned</span>
      `
    }
  } catch (e: unknown) {
    handleError(e)
  }
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
  const { psbt, descriptors, network } = getInputs()
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
  const inputs = getInputs()
  const { address, descriptors, electrum, network } = inputs
  const isValid = await validateDescriptor()
  if (!isValid) return
  if (!address) {
    DOM.inputs.address.classList.add('input-error')
  }
  require(address, 'Address')

  const feeRate = await getFeeRate()
  if (feeRate.failed) {
    DOM.outputs.tempMessage.textContent =
      'Unable to automatically estimate a fee for this network. Please enter a fee rate manually.'
    return
  }

  DOM.outputs.tempMessage.textContent = 'Please wait...'
  try {
    const userBubble = createConversationBubble(
      `Create a transaction (PSBT) sending all wallet funds to <span class="break-all font-bold">${address}</span> (fee rate: ${feeRate.value} sats/vB)`,
      true
    )
    DOM.outputs.conversation.appendChild(userBubble)
    const { psbt, outbound, fee } = await commands.sweep(address, feeRate.value, network, descriptors, electrum)
    clearStatusIndicators(DOM.outputs.psbtTextArea)
    // Show transaction overview and populate transaction overview table
    DOM.outputs.transactionOverview.classList.remove('hidden')
    populateTransactionOverview({ address: DOM.inputs.address.value, outbound, fee })
    // Populate PSBT textarea even though it is not shown
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

async function validateAddress() {
  const { address, descriptors, network } = getInputs()
  DOM.inputs.address.classList.remove('input-success')
  DOM.inputs.address.classList.remove('input-error')
  DOM.inputs.address.classList.remove('input-warning')

  if (!address) {
    // this message is really only needed to make sure a previous bad 'tempMessage' is cleared.
    DOM.outputs.tempMessage.textContent = 'No address provided'
    return false
  }

  try {
    const isValid = await commands.isAddress(address)
    if (!isValid) {
      DOM.inputs.address.classList.add('input-error')
      DOM.outputs.tempMessage.textContent = 'This address is not valid.'
      return false
    }

    const isForNetwork = await commands.isAddressForNetwork(address, network)
    if (!isForNetwork) {
      DOM.inputs.address.classList.add('input-error')
      DOM.outputs.tempMessage.textContent = 'This address is not for the selected network'
      return false
    }

    const isMine = await commands.isAddressMine(address, network, descriptors)
    if (isMine) {
      DOM.outputs.tempMessage.textContent =
        'Warning: This address belongs to the same wallet. Please be sure you intend to send this transaction to yourself.'
      DOM.inputs.address.classList.add('input-warning')
      return false
    }

    DOM.inputs.address.classList.add('input-success')
    DOM.outputs.tempMessage.textContent = 'This address looks good!'
    return true
  } catch (e: unknown) {
    DOM.inputs.address.classList.add('input-error')
    handleError(e)
  }

  return false
}

window.addEventListener('DOMContentLoaded', () => {
  initializeDOM()

  DOM.buttons.estimate.addEventListener('click', (e) => {
    e.preventDefault()
    estimateFee()
  })

  DOM.buttons.balance.addEventListener('click', (e) => {
    e.preventDefault()
    getBalance()
  })

  DOM.buttons.transactions.addEventListener('click', (e) => {
    e.preventDefault()
    getTransactions()
  })

  DOM.buttons.address.addEventListener('click', (e) => {
    e.preventDefault()
    getAddress()
  })

  DOM.buttons.sweep.addEventListener('click', (e) => {
    e.preventDefault()
    sweep()
  })

  DOM.buttons.copyPsbt.addEventListener('click', (e) => {
    e.preventDefault()
    copyPsbtToClipboard()
  })

  DOM.buttons.pastePsbt.addEventListener('click', (e) => {
    e.preventDefault()
    pastePsbtFromClipboard()
  })

  DOM.buttons.sign.addEventListener('click', (e) => {
    e.preventDefault()
    sign()
  })

  DOM.buttons.enumerate.addEventListener('click', (e) => {
    e.preventDefault()
    enumerate()
  })

  DOM.inputs.address.addEventListener('input', validateAddress)

  DOM.checkboxes.change.addEventListener('click', showChangeInput)
  DOM.checkboxes.electrum.addEventListener('click', showElectrumInput)
  DOM.checkboxes.network.addEventListener('click', showNetworkInput)

  DOM.buttons.broadcast.addEventListener('click', (e) => {
    e.preventDefault()
    broadcast()
  })

  DOM.outputs.psbtTextArea.addEventListener('input', () => {
    DOM.buttons.broadcast.classList.remove('btn-disabled')
    DOM.outputs.psbtSignHistory.innerHTML = ''
    validatePsbt()
  })

  // Add event listeners for validation of descriptor
  DOM.inputs.receive.addEventListener('blur', validateDescriptor)
  DOM.inputs.receive.addEventListener('input', () => {
    // Clean up the input
    DOM.inputs.receive.value = DOM.inputs.receive.value.replace(/\r?\n|\r/g, '').trim()
    validateDescriptor()
  })
  DOM.inputs.networkRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      DOM.inputs.address.value = ''
      clearStatusIndicators(DOM.inputs.address)
      validateDescriptor()
    })
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
  const clearMessagesBtn = document.getElementById('clear-messages-btn')
  clearMessagesBtn.addEventListener('click', () => {
    DOM.outputs.conversation.innerHTML = ''
    DOM.outputs.tempMessage.textContent = 'All messages cleared 🫡'
    clearMessagesBtn.classList.add('hidden')
  })
})
