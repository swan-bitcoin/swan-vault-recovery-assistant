import { readText as fromClipboard, writeText as toClipboard } from '@tauri-apps/plugin-clipboard-manager'
import { commands, type TempuraError } from './bindings'
import { Address, Balance, Success, Transactions } from './components'
import { createConversationBubble, isChangeDescriptor } from './helpers'
import { getDevice, getDeviceMessage, getDevicePrompt, getSignMessageAndPsbt } from './parsing'

let DOM: {
  addressInput: HTMLInputElement
  changeInput: HTMLInputElement
  electrumInput: HTMLInputElement
  feeRateInput: HTMLInputElement
  tempMessage: HTMLDivElement
  txBody: HTMLTableSectionElement
  txModal: HTMLDialogElement
  conversation: HTMLDivElement
  networkRadios: NodeListOf<HTMLInputElement>
  psbtTextArea: HTMLTextAreaElement
  receiveInput: HTMLInputElement
}

function isTempuraError(e: unknown): e is TempuraError {
  const tempuraError = e as TempuraError
  return !!(tempuraError.error_type && tempuraError.message)
}

function handleError(e: unknown) {
  if (isTempuraError(e)) {
    console.log(e.error_type, e.message)
    DOM.tempMessage.textContent = e.error_type.concat(': ').concat(e.message)
    return
  }

  if (e instanceof Error) {
    console.error(e)
    DOM.tempMessage.textContent = e.message
    return
  }

  DOM.tempMessage.textContent = 'An unknown error occurred'
}

const validateDescriptor = async () => {
  const descriptor = DOM.receiveInput.value
  const network = Array.from(DOM.networkRadios).find((radio) => radio.checked).value
  const standardWalletActions = document.getElementById('standard-wallet-actions')
  const recoveryOptionsCard = document.getElementById('recovery-options-card')

  if (!descriptor) {
    DOM.tempMessage.textContent = 'Wallet configuration is missing!'
    DOM.receiveInput.classList.add('textarea-error')
    DOM.receiveInput.classList.remove('textarea-success')
    return false
  }

  // TODO: Show dialog box here to ask user to confirm if they want to use a change descriptor
  // Check if the descriptor is a change descriptor
  if (isChangeDescriptor(descriptor)) {
    DOM.tempMessage.textContent = 'You are trying to use a change descriptor! Please provide a receive descriptor instead.'
    DOM.receiveInput.classList.add('textarea-error')
    DOM.receiveInput.classList.remove('textarea-success')
    return false
  }

  try {
    const isValidDescriptor = await commands.isDescriptorForNetwork(descriptor, network)
    if (!isValidDescriptor) {
      DOM.tempMessage.textContent =
        'Descriptor is fine but it is for the wrong network. Switch to Advanced Mode to change the network!'
      DOM.receiveInput.classList.add('textarea-error')
      DOM.receiveInput.classList.remove('textarea-success')
      return false
    }

    // Descriptor is valid, show now wallet actions and recovery options card (one way switch)
    DOM.receiveInput.classList.add('textarea-success')
    DOM.receiveInput.classList.remove('textarea-error')
    DOM.tempMessage.textContent =
      'Your wallet configuration is valid. You can now fetch your balance and perform other actions.'
    recoveryOptionsCard.classList.remove('hidden')
    standardWalletActions.classList.remove('hidden')
    return true
  } catch (error) {
    handleError(error)
    DOM.receiveInput.classList.add('textarea-error')
    DOM.receiveInput.classList.remove('textarea-success')
    return false
  }
}

type Inputs = {
  address: string
  recv: string
  change: string | null
  electrum: string | null
  feeRate: number | null
  network: string
  psbt: string
}

function getInputs(): Inputs {
  const address = DOM.addressInput.value.trim()
  const recv = DOM.receiveInput.value.trim()
  const change = DOM.changeInput?.value.trim() || null
  const electrum = DOM.electrumInput?.value.trim() || null
  const feeRate = Number(DOM.feeRateInput?.value.trim()) || null
  const network = Array.from(DOM.networkRadios).find((radio) => radio.checked)!.value
  const psbt = DOM.psbtTextArea.value.trim()

  return {
    address,
    recv,
    change,
    electrum,
    feeRate,
    network,
    psbt,
  }
}

function require(value: unknown, itemName: string) {
  if (!value) {
    const message = itemName.concat(' is required')
    DOM.tempMessage.textContent = message
    throw new Error(message)
  }
}

async function broadcast() {
  const { recv, change, electrum, network, psbt } = getInputs()
  const isValid = await validateDescriptor()
  if (!isValid) return
  require(psbt, 'PSBT')

  DOM.tempMessage.textContent = 'Please wait...'
  try {
    const userBubble = createConversationBubble('Broadcast the transaction from this PSBT', true)
    DOM.conversation.appendChild(userBubble)
    await commands.broadcast(psbt, network, recv, change, electrum)
    const tempuraBubble = createConversationBubble('Broadcast successful!')
    DOM.conversation.appendChild(tempuraBubble)
    DOM.tempMessage.textContent = 'Anything else?'
  } catch (e: unknown) {
    handleError(e)
  }
}

async function enumerate() {
  const { network } = getInputs()

  DOM.tempMessage.textContent = 'Please wait... (be sure to check attached device for prompts)'
  try {
    const userBubble = createConversationBubble('Find my device', true)
    DOM.conversation.appendChild(userBubble)
    const response = await commands.enumerate(network)
    const tempuraBubble = createConversationBubble(getDeviceMessage(response))
    DOM.conversation.appendChild(tempuraBubble)
    DOM.tempMessage.textContent = getDevicePrompt(response)
  } catch (e: unknown) {
    handleError(e)
  }
}

async function getBalance() {
  const { recv, change, electrum, network } = getInputs()
  const isValid = await validateDescriptor()
  if (!isValid) return
  DOM.tempMessage.textContent = 'Fetching balance ...'

  try {
    const userBubble = createConversationBubble('What is my balance?', true)
    DOM.conversation.appendChild(userBubble)
    const balance = await commands.balance(network, recv, change, electrum)
    DOM.tempMessage.textContent = 'Balance fetched successfully!'
    const tempuraBubble = createConversationBubble(
      Balance({
        confirmed: balance.confirmed,
        unconfirmed: balance.untrusted_pending,
      })
    )
    DOM.conversation.appendChild(tempuraBubble)
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
          DOM.tempMessage.textContent = `Failed to copy ${copyButton.getAttribute('value')} to clipboard`
        })
    })
  })
}

async function getTransactions() {
  const { recv, change, electrum, network } = getInputs()
  const isValid = await validateDescriptor()
  if (!isValid) return
  DOM.tempMessage.textContent = 'Fetching transactions ...'

  try {
    const userBubble = createConversationBubble('Show me my transactions', true)
    DOM.conversation.appendChild(userBubble)
    const transactions = await commands.transactions(network, recv, change, electrum)
    DOM.txModal.showModal()
    DOM.txBody.innerHTML = Transactions(transactions)
    DOM.tempMessage.textContent = 'Transactions fetched successfully!'
    const tempuraBubble = createConversationBubble(`${transactions.length} transactions fetched`)
    DOM.conversation.appendChild(tempuraBubble)
    instrumentCopyButtons(DOM.txBody)
  } catch (e: unknown) {
    handleError(e)
  }
}

async function getAddress() {
  const { recv, electrum, network } = getInputs()
  const isValid = await validateDescriptor()
  if (!isValid) return
  DOM.tempMessage.textContent = 'Getting the next unused address for you ...'
  try {
    const userBubble = createConversationBubble('Give me an address!', true)
    DOM.conversation.appendChild(userBubble)
    const { address } = await commands.address(network, recv, electrum)
    DOM.tempMessage.textContent = 'Address retrieved successfully!'
    const tempuraBubble = createConversationBubble(Address({ address }))
    DOM.conversation.appendChild(tempuraBubble)
    instrumentCopyButtons(tempuraBubble)
  } catch (e: unknown) {
    handleError(e)
  }
}

function copyPsbtToClipboard() {
  const psbt = DOM.psbtTextArea.value.trim()
  if (!psbt) {
    DOM.tempMessage.textContent = 'No PSBT to copy'
    return
  }

  toClipboard(psbt)
    .then(() => {
      DOM.tempMessage.textContent = 'PSBT copied to clipboard'
    })
    .catch((e) => {
      console.log('Failed to copy PSBT to clipboard', e)
      DOM.tempMessage.textContent = 'Failed to copy PSBT to clipboard'
    })
}

async function estimateFee() {
  DOM.tempMessage.textContent = 'Please wait...'
  try {
    const { electrum, network } = getInputs()
    const feeRate = await commands.estimateFee(network, electrum)
    DOM.feeRateInput.value = feeRate.toString()
    DOM.tempMessage.innerHTML = Success('Fee retrieved')
  } catch (e: unknown) {
    handleError(e)
  }
}

function pastePsbtToClipboard() {
  fromClipboard()
    .then((psbt) => {
      const trimmed = psbt.trim()
      DOM.psbtTextArea.value = trimmed
      if (!trimmed || !trimmed.startsWith('cHNid')) {
        DOM.tempMessage.textContent = 'Warning: Pasted data does not look like a PSBT'
      } else {
        DOM.tempMessage.textContent = 'PSBT pasted'
      }
    })
    .catch((e) => {
      console.log('Failed to paste PSBT from clipboard', e)
      DOM.tempMessage.textContent = 'Failed to copy PSBT to clipboard'
    })
}

async function sign() {
  const { network, psbt } = getInputs()
  require(psbt, 'PSBT')

  DOM.tempMessage.textContent = 'Please wait... Make sure your device is unlocked (PIN entered).'
  try {
    const userBubble = createConversationBubble('Sign this transaction (PSBT)', true)
    DOM.conversation.appendChild(userBubble)
    const enumeration = await commands.enumerate(network)
    const device = getDevice(enumeration)
    DOM.tempMessage.textContent = 'Follow the instructions on your device (might take a few seconds for them to appear).'
    const response = await commands.sign(psbt, network, device.type)
    const { message, psbt: responsePsbt } = getSignMessageAndPsbt(response)
    DOM.psbtTextArea.value = responsePsbt

    DOM.tempMessage.textContent = 'Sign again or broadcast next?'
    const tempuraBubble = createConversationBubble(message)
    DOM.conversation.appendChild(tempuraBubble)
  } catch (e: unknown) {
    handleError(e)
  }
}

async function sweep() {
  const inputs = getInputs()
  const { address, recv, change, electrum, network } = inputs
  let { feeRate } = inputs
  const isValid = await validateDescriptor()
  if (!isValid) return
  require(address, 'Address')

  DOM.tempMessage.textContent = 'Please wait...'
  try {
    const userBubble = createConversationBubble(`Create a transaction (PSBT) sending all wallet funds to ${address}`, true)
    DOM.conversation.appendChild(userBubble)
    feeRate = feeRate || (await commands.estimateFee(network, electrum))
    const psbt = await commands.sweep(address, feeRate, network, recv, change, electrum)
    DOM.psbtTextArea.value = psbt.psbt

    DOM.tempMessage.textContent = 'Sign next?'
    const tempuraBubble = createConversationBubble(Success('Transaction (PSBT) created!'))
    DOM.conversation.appendChild(tempuraBubble)
  } catch (e: unknown) {
    handleError(e)
  }
}

function requireDomElement<T extends HTMLElement>(name: string): T {
  const element = document.querySelector<T>(name)
  if (!element) {
    throw new Error(`Failed to initialize: missing required DOM element ${name}`)
  }
  return element
}

function requireDomElements<T extends HTMLElement>(name: string): NodeListOf<T> {
  const elements = document.querySelectorAll<T>(name)
  if (elements.length === 0) {
    throw new Error(`Failed to initialize: missing required DOM element ${name}`)
  }
  return elements
}

window.addEventListener('DOMContentLoaded', () => {
  let tempMessage: HTMLDivElement | undefined = undefined
  try {
    tempMessage = requireDomElement<HTMLDivElement>('#temporary-message')
    const txBody = requireDomElement<HTMLTableSectionElement>('#transactions-body')
    const txModal = requireDomElement<HTMLDialogElement>('#transactions-modal')
    const conversation = requireDomElement<HTMLDivElement>('#conversation')
    const addressInput = requireDomElement<HTMLInputElement>('#address-input')
    const changeInput = requireDomElement<HTMLInputElement>('#change-input')
    const electrumInput = requireDomElement<HTMLInputElement>('#electrum-input')
    const feeRateInput = requireDomElement<HTMLInputElement>('#feerate-input')
    const networkRadios = requireDomElements<HTMLInputElement>('input[name="network"]')
    const psbtTextArea = requireDomElement<HTMLTextAreaElement>('#psbt-textarea')
    const receiveInput = requireDomElement<HTMLInputElement>('#receive-input')

    DOM = {
      addressInput,
      changeInput,
      electrumInput,
      feeRateInput,
      tempMessage,
      txBody,
      txModal,
      conversation,
      networkRadios,
      psbtTextArea,
      receiveInput,
    }

    requireDomElement<HTMLInputElement>('#estimate-button').addEventListener('click', (e) => {
      e.preventDefault()
      estimateFee()
    })

    requireDomElement<HTMLButtonElement>('#fetch-balance-button').addEventListener('click', (e) => {
      e.preventDefault()
      getBalance()
    })

    requireDomElement<HTMLButtonElement>('#fetch-transactions-button').addEventListener('click', (e) => {
      e.preventDefault()
      getTransactions()
    })

    requireDomElement<HTMLButtonElement>('#new-address-button').addEventListener('click', (e) => {
      e.preventDefault()
      getAddress()
    })

    requireDomElement<HTMLButtonElement>('#sweep-button').addEventListener('click', (e) => {
      e.preventDefault()
      sweep()
    })

    requireDomElement<HTMLButtonElement>('#copy-psbt-button').addEventListener('click', (e) => {
      e.preventDefault()
      copyPsbtToClipboard()
    })

    requireDomElement<HTMLButtonElement>('#paste-psbt-button').addEventListener('click', (e) => {
      e.preventDefault()
      pastePsbtToClipboard()
    })

    requireDomElement<HTMLButtonElement>('#broadcast-button').addEventListener('click', (e) => {
      e.preventDefault()
      broadcast()
    })

    requireDomElement<HTMLButtonElement>('#sign-message-button').addEventListener('click', (e) => {
      e.preventDefault()
      sign()
    })

    requireDomElement<HTMLButtonElement>('#enumerate-button').addEventListener('click', (e) => {
      e.preventDefault()
      enumerate()
    })

    // Add event listeners for validation of descriptor
    receiveInput.addEventListener('blur', validateDescriptor)
    receiveInput.addEventListener('input', validateDescriptor)
    DOM.networkRadios.forEach((radio) => {
      radio.addEventListener('change', validateDescriptor)
    })
  } catch (e: unknown) {
    const error = (e as Error) || new Error('Failed to initialize: missing required DOM elements')
    if (tempMessage) {
      tempMessage.textContent = error.message
    }
  }
})
