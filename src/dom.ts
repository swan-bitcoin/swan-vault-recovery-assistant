import { Descriptors, TempuraError } from './bindings'

type Buttons = {
  broadcast: HTMLButtonElement
  clearMessages: HTMLButtonElement
  copyPsbt: HTMLButtonElement
  enumerate: HTMLButtonElement
  estimate: HTMLButtonElement
  existingPsbt: HTMLButtonElement
  load: HTMLButtonElement
  pastePsbt: HTMLButtonElement
  sign: HTMLButtonElement
  sweep: HTMLButtonElement
}

type Checkboxes = {
  change: HTMLInputElement
  electrum: HTMLInputElement
  network: HTMLInputElement
  psbtDetails: HTMLInputElement
}

type Radios = {
  walletConfigurationCollapse: HTMLInputElement
  recoveryOptionsCollapse: HTMLInputElement
  sendTransactionCollapse: HTMLInputElement
}

type Containers = {
  change: HTMLDivElement
  electrum: HTMLDivElement
  footer: HTMLDivElement
  mainContent: HTMLDivElement
  network: HTMLDivElement
  psbtDetails: HTMLDivElement
  toast: HTMLDivElement
  walletActions: HTMLDivElement
}

type Inputs = {
  address: HTMLInputElement
  change: HTMLInputElement
  electrum: HTMLInputElement
  feeRate: HTMLInputElement
  networkRadios: NodeListOf<HTMLInputElement>
  receive: HTMLInputElement
}

type Labels = {
  psbtDetails: HTMLLabelElement
}

type Links = {
  about: HTMLAnchorElement
}

type Outputs = {
  conversation: HTMLDivElement
  psbtSignHistory: HTMLUListElement
  psbtStatus: HTMLDivElement
  psbtTextArea: HTMLTextAreaElement
  tempMessage: HTMLDivElement
  transactionOverview: HTMLDivElement
  txBody: HTMLTableSectionElement
  txModal: HTMLDialogElement
}

type DOM = {
  buttons: Buttons
  checkboxes: Checkboxes
  radios: Radios
  containers: Containers
  inputs: Inputs
  labels: Labels
  links: Links
  outputs: Outputs
}
export let DOM: DOM

type UserInputs = {
  address: string
  descriptors: Descriptors
  electrum: string | null
  feeRate: number | null
  network: string
  psbt: string
}

export function clearStatusIndicators(element: HTMLElement) {
  element.classList.remove('input-success')
  element.classList.remove('input-error')
  element.classList.remove('input-warning')
  element.classList.remove('textarea-success')
  element.classList.remove('textarea-error')
  element.classList.remove('textarea-warning')
}

export const showOnlyPsbtArea = () => {
  DOM.outputs.psbtTextArea.value = '' // if someone created a psbt before clicking "I have a PSBT"
  DOM.outputs.transactionOverview.classList.add('hidden') // also if someone created a psbt before
  DOM.checkboxes.psbtDetails.classList.add('hidden')
  DOM.labels.psbtDetails.classList.add('hidden')
  DOM.containers.psbtDetails.classList.remove('hidden')
  DOM.checkboxes.psbtDetails.checked = true
  DOM.radios.sendTransactionCollapse.checked = true
}

export const restorePsbtDetails = () => {
  DOM.outputs.psbtTextArea.value = ''
  DOM.checkboxes.psbtDetails.classList.remove('hidden')
  DOM.labels.psbtDetails.classList.remove('hidden')
  DOM.containers.psbtDetails.classList.add('hidden')
  DOM.checkboxes.psbtDetails.checked = false
}

export function getUserInputs(): UserInputs {
  const address = DOM.inputs.address.value.trim()
  const autoChange = DOM.checkboxes.change.checked
  const receive = DOM.inputs.receive.value.trim()
  const change = DOM.inputs.change?.value.trim() || null
  const electrum = DOM.inputs.electrum?.value.trim() || null
  const feeRate = Number(DOM.inputs.feeRate?.value.trim()) || null
  const network = Array.from(DOM.inputs.networkRadios).find((radio) => radio.checked)!.value
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

export function handleError(e: unknown) {
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

export function initializeDOM() {
  let tempMessage: HTMLDivElement | undefined = undefined
  try {
    tempMessage = requireDomElement<HTMLDivElement>('#temporary-message')

    const buttons = {
      broadcast: requireDomElement<HTMLButtonElement>('#broadcast-button'),
      clearMessages: requireDomElement<HTMLButtonElement>('#clear-messages-button'),
      copyPsbt: requireDomElement<HTMLButtonElement>('#copy-psbt-button'),
      enumerate: requireDomElement<HTMLButtonElement>('#enumerate-button'),
      estimate: requireDomElement<HTMLButtonElement>('#estimate-button'),
      existingPsbt: requireDomElement<HTMLButtonElement>('#existing-psbt-button'),
      load: requireDomElement<HTMLButtonElement>('#fetch-wallet-button'),
      pastePsbt: requireDomElement<HTMLButtonElement>('#paste-psbt-button'),
      sign: requireDomElement<HTMLButtonElement>('#sign-button'),
      sweep: requireDomElement<HTMLButtonElement>('#sweep-button'),
    }

    const checkboxes = {
      change: requireDomElement<HTMLInputElement>('#auto-change-checkbox'),
      electrum: requireDomElement<HTMLInputElement>('#auto-electrum-checkbox'),
      network: requireDomElement<HTMLInputElement>('#network-checkbox'),
      psbtDetails: requireDomElement<HTMLInputElement>('#psbt-details-toggle'),
    }

    const radios = {
      walletConfigurationCollapse: requireDomElement<HTMLInputElement>('#wallet-configuration-collapse-radio'),
      recoveryOptionsCollapse: requireDomElement<HTMLInputElement>('#recovery-options-collapse-radio'),
      sendTransactionCollapse: requireDomElement<HTMLInputElement>('#send-transaction-collapse-radio'),
    }

    const containers = {
      change: requireDomElement<HTMLDivElement>('#change-input-container'),
      electrum: requireDomElement<HTMLDivElement>('#electrum-input-container'),
      footer: requireDomElement<HTMLDivElement>('#footer'),
      mainContent: requireDomElement<HTMLDivElement>('#main-content'),
      network: requireDomElement<HTMLDivElement>('#network-input-container'),
      psbtDetails: requireDomElement<HTMLDivElement>('#psbt-details-container'),
      toast: requireDomElement<HTMLDivElement>('#toast-container'),
      walletActions: requireDomElement<HTMLDivElement>('#wallet-actions'),
    }

    const inputs = {
      address: requireDomElement<HTMLInputElement>('#address-input'),
      change: requireDomElement<HTMLInputElement>('#change-input'),
      electrum: requireDomElement<HTMLInputElement>('#electrum-input'),
      feeRate: requireDomElement<HTMLInputElement>('#feerate-input'),
      networkRadios: requireDomElements<HTMLInputElement>('input[name="network"]'),
      receive: requireDomElement<HTMLInputElement>('#receive-input'),
    }

    const labels = {
      psbtDetails: requireDomElement<HTMLLabelElement>('#psbt-details-toggle-label'),
    }

    const links = {
      about: requireDomElement<HTMLAnchorElement>('#about-link'),
    }

    const outputs = {
      conversation: requireDomElement<HTMLDivElement>('#conversation'),
      psbtSignHistory: requireDomElement<HTMLUListElement>('#psbt-sign-history'),
      psbtStatus: requireDomElement<HTMLDivElement>('#psbt-status'),
      psbtTextArea: requireDomElement<HTMLTextAreaElement>('#psbt-textarea'),
      tempMessage,
      transactionOverview: requireDomElement<HTMLDivElement>('#transaction-overview-container'),
      txBody: requireDomElement<HTMLTableSectionElement>('#transactions-body'),
      txModal: requireDomElement<HTMLDialogElement>('#transactions-modal'),
    }

    DOM = {
      buttons,
      checkboxes,
      radios,
      containers,
      inputs,
      labels,
      links,
      outputs,
    }
  } catch (e: unknown) {
    const error = (e as Error) || new Error('Failed to initialize: missing required DOM elements')
    if (tempMessage) {
      tempMessage.textContent = error.message
    }
  }
}

function isTempuraError(e: unknown): e is TempuraError {
  const tempuraError = e as TempuraError
  return !!(tempuraError.error_type && tempuraError.message)
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
