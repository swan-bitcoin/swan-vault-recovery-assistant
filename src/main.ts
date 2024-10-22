import { commands, type TempuraError } from './bindings'
import { writeText as toClipboard, readText as fromClipboard } from '@tauri-apps/plugin-clipboard-manager'
import { getDevice, getDeviceMessage, getSignMessageAndPsbt } from './parsing'

let DOM: {
  addressInput: HTMLInputElement
  changeInput: HTMLInputElement
  electrumInput: HTMLInputElement
  feeRateInput: HTMLInputElement
  message: HTMLParagraphElement
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
    DOM.message.textContent = e.error_type.concat(': ').concat(e.message)
    return
  }

  if (e instanceof Error) {
    console.error(e)
    DOM.message.textContent = e.message
    return
  }

  DOM.message.textContent = 'An unknown error occurred'
}

type Inputs = {
  address: string
  recv: string
  change: string | null
  electrum: string | null
  feeRate: number
  network: string
  psbt: string
}

function getInputs(): Inputs {
  const address = DOM.addressInput.value.trim()
  const recv = DOM.receiveInput.value.trim()
  const change = DOM.changeInput?.value.trim() || null
  const electrum = DOM.electrumInput?.value.trim() || null
  const feeRate = Number(DOM.feeRateInput?.value.trim())
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
    DOM.message.textContent = message
    throw new Error(message)
  }
}

async function broadcast() {
  const { recv, change, electrum, network, psbt } = getInputs()
  require(recv, 'Receive Descriptor')
  require(psbt, 'PSBT')

  DOM.message.textContent = 'Please wait...'
  try {
    await commands.broadcast(psbt, network, recv, change, electrum)
    DOM.message.textContent = 'Broadcast successful!'
  } catch (e: unknown) {
    handleError(e)
  }
}

async function enumerate() {
  const { network } = getInputs()

  DOM.message.textContent = 'Please wait... (be sure to check attached devices for prompts)'
  try {
    const response = await commands.enumerate(network)
    DOM.message.textContent = getDeviceMessage(response)
  } catch (e: unknown) {
    handleError(e)
  }
}

async function getBalance() {
  const { recv, change, electrum, network } = getInputs()
  require(recv, 'Receive Descriptor')

  DOM.message.textContent = 'Please wait...'
  try {
    const balance = await commands.balance(network, recv, change, electrum)
    DOM.message.textContent = 'confirmed: '
      .concat(balance.confirmed)
      .concat(' sats')
      .concat(' unconfirmed: ')
      .concat(balance.untrusted_pending)
      .concat(' sats')
  } catch (e: unknown) {
    handleError(e)
  }
}

async function getAddress() {
  const { recv, electrum, network } = getInputs()
  require(recv, 'Receive Descriptor')

  DOM.message.textContent = 'Please wait...'
  try {
    const address = await commands.address(network, recv, electrum)
    DOM.message.textContent = 'address: '.concat(address.address)
  } catch (e: unknown) {
    handleError(e)
  }
}

function copyPsbtToClipboard() {
  const psbt = DOM.psbtTextArea.value.trim()
  if (!psbt) {
    DOM.message.textContent = 'No PSBT to copy'
    return
  }

  toClipboard(psbt)
    .then(() => {
      DOM.message.textContent = 'PSBT copied to clipboard'
    })
    .catch((e) => {
      console.log('Failed to copy PSBT to clipboard', e)
      DOM.message.textContent = 'Failed to copy PSBT to clipboard'
    })
}

async function estimateFee() {
  DOM.message.textContent = 'Please wait...'
  try {
    const { electrum, network } = getInputs()
    const feeRate = await commands.estimateFee(network, electrum)
    DOM.feeRateInput.value = feeRate.toString()
    DOM.message.textContent = 'fee estimate retrieved successfully'
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
        DOM.message.textContent = 'Warning: Pasted data does not look like a PSBT'
      } else {
        DOM.message.textContent = 'PSBT pasted'
      }
    })
    .catch((e) => {
      console.log('Failed to paste PSBT from clipboard', e)
      DOM.message.textContent = 'Failed to copy PSBT to clipboard'
    })
}

async function sign() {
  const { network, psbt } = getInputs()
  require(psbt, 'PSBT')

  DOM.message.textContent = 'Please wait...'
  try {
    const enumeration = await commands.enumerate(network)
    const device = getDevice(enumeration)
    const response = await commands.sign(psbt, network, device.type)
    const { message, signedPsbt } = getSignMessageAndPsbt(response)
    DOM.psbtTextArea.value = signedPsbt
    DOM.message.textContent = message
  } catch (e: unknown) {
    handleError(e)
  }
}

async function sweep() {
  const { address, recv, change, electrum, feeRate, network } = getInputs()
  require(recv, 'Receive Descriptor')
  require(address, 'Address')
  require(feeRate, 'Fee Rate')

  DOM.message.textContent = 'Please wait...'
  try {
    const psbt = await commands.sweep(address, feeRate, network, recv, change, electrum)
    DOM.psbtTextArea.value = psbt.psbt
    DOM.message.textContent = 'PSBT created'
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
  let message: HTMLParagraphElement | undefined = undefined
  try {
    message = requireDomElement<HTMLParagraphElement>('#message')
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
      message,
      networkRadios,
      psbtTextArea,
      receiveInput,
    }

    requireDomElement<HTMLInputElement>('#estimate-button').addEventListener('click', (e) => {
      estimateFee()
    })

    requireDomElement<HTMLButtonElement>('#fetch-balance-button').addEventListener('click', (e) => {
      e.preventDefault()
      getBalance()
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
  } catch (e: unknown) {
    const error = (e as Error) || new Error('Failed to initialize: missing required DOM elements')
    if (message) {
      message.textContent = error.message
    }
  }
})
