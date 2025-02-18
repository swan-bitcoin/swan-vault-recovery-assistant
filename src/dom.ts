import { Descriptors, TempuraError } from './bindings'
import { showTempMessage } from './utilities'

type Buttons = {
  broadcast: HTMLButtonElement
  clearMessages: HTMLButtonElement
  copyPsbt: HTMLButtonElement
  enumerate: HTMLButtonElement
  estimate: HTMLButtonElement
  load: HTMLButtonElement
  modals: ModalButtons
  pastePsbt: HTMLButtonElement
  sign: HTMLButtonElement
  sweep: HTMLButtonElement
}

type Checkboxes = {
  change: HTMLInputElement
  electrum: HTMLInputElement
  feeRate: HTMLInputElement
  network: HTMLInputElement
}

type Radios = {
  walletConfigurationCollapse: HTMLInputElement
  recoveryOptionsCollapse: HTMLInputElement
  sendTransactionCollapse: HTMLInputElement
}

type Containers = {
  change: HTMLDivElement
  electrum: HTMLDivElement
  feeRate: HTMLDivElement
  footer: HTMLDivElement
  mainContent: HTMLDivElement
  network: HTMLDivElement
  walletActions: HTMLDivElement
}

type FeedbackElements = {
  receiveInputValidationMessage: HTMLDivElement
  addressInputValidationMessage: HTMLDivElement
  psbtInputValidationMessage: HTMLDivElement
}

type Inputs = {
  address: HTMLInputElement
  change: HTMLInputElement
  electrum: HTMLInputElement
  feeRate: HTMLInputElement
  networkRadios: NodeListOf<HTMLInputElement>
  receive: HTMLInputElement
}

type Links = {
  about: HTMLAnchorElement
}

type Modals = {
  autoChange: HTMLDialogElement
  autoElectrum: HTMLDialogElement
  electrumServer: HTMLDialogElement
  feeRate: HTMLDialogElement
  network: HTMLDialogElement
  transactions: HTMLDialogElement
  walletConfig: HTMLDialogElement
}

type ModalButtons = {
  autoChange: HTMLButtonElement
  autoElectrum: HTMLButtonElement
  electrumServer: HTMLButtonElement
  feeRate: HTMLButtonElement
  network: HTMLButtonElement
  walletConfig: HTMLButtonElement
}

type Outputs = {
  conversation: HTMLDivElement
  psbtSignHistory: HTMLUListElement
  psbtStatus: HTMLDivElement
  psbtTextArea: HTMLTextAreaElement
  tempMessage: HTMLDivElement
  tempMessageContainer: HTMLDivElement
  transactionOverview: HTMLDivElement
  txBody: HTMLTableSectionElement
}

type DOM = {
  buttons: Buttons
  checkboxes: Checkboxes
  containers: Containers
  feedback: FeedbackElements
  inputs: Inputs
  links: Links
  modals: Modals
  outputs: Outputs
  radios: Radios
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
    showTempMessage(e.error_type.concat(': ').concat(e.message))
    return
  }

  if (e instanceof Error) {
    console.error(e)
    showTempMessage(e.message)
    return
  }

  showTempMessage('An unknown error occurred')
}

export function initializeDOM() {
  let tempMessage: HTMLDivElement | undefined = undefined
  try {
    tempMessage = requireDomElement<HTMLDivElement>('#temporary-message')

    const feedback = {
      receiveInputValidationMessage: requireDomElement<HTMLDivElement>('#receive-input-validation-message'),
      addressInputValidationMessage: requireDomElement<HTMLDivElement>('#address-input-validation-message'),
      psbtInputValidationMessage: requireDomElement<HTMLDivElement>('#psbt-input-validation-message'),
    }

    const buttons = {
      broadcast: requireDomElement<HTMLButtonElement>('#broadcast-button'),
      clearMessages: requireDomElement<HTMLButtonElement>('#clear-messages-button'),
      copyPsbt: requireDomElement<HTMLButtonElement>('#copy-psbt-button'),
      enumerate: requireDomElement<HTMLButtonElement>('#enumerate-button'),
      estimate: requireDomElement<HTMLButtonElement>('#estimate-button'),
      load: requireDomElement<HTMLButtonElement>('#fetch-wallet-button'),
      modals: {
        autoChange: requireDomElement<HTMLButtonElement>('#auto-change-modal-button'),
        autoElectrum: requireDomElement<HTMLButtonElement>('#auto-electrum-modal-button'),
        electrumServer: requireDomElement<HTMLButtonElement>('#electrum-server-modal-button'),
        feeRate: requireDomElement<HTMLButtonElement>('#fee-rate-modal-button'),
        network: requireDomElement<HTMLButtonElement>('#network-modal-button'),
        walletConfig: requireDomElement<HTMLButtonElement>('#wallet-config-modal-button'),
      },
      pastePsbt: requireDomElement<HTMLButtonElement>('#paste-psbt-button'),
      sign: requireDomElement<HTMLButtonElement>('#sign-button'),
      sweep: requireDomElement<HTMLButtonElement>('#sweep-button'),
    }

    const checkboxes = {
      change: requireDomElement<HTMLInputElement>('#auto-change-checkbox'),
      electrum: requireDomElement<HTMLInputElement>('#auto-electrum-checkbox'),
      feeRate: requireDomElement<HTMLInputElement>('#auto-fee-rate-checkbox'),
      network: requireDomElement<HTMLInputElement>('#network-checkbox'),
    }

    const radios = {
      walletConfigurationCollapse: requireDomElement<HTMLInputElement>('#wallet-configuration-collapse-radio'),
      recoveryOptionsCollapse: requireDomElement<HTMLInputElement>('#recovery-options-collapse-radio'),
      sendTransactionCollapse: requireDomElement<HTMLInputElement>('#send-transaction-collapse-radio'),
    }

    const containers = {
      change: requireDomElement<HTMLDivElement>('#change-input-container'),
      electrum: requireDomElement<HTMLDivElement>('#electrum-input-container'),
      feeRate: requireDomElement<HTMLDivElement>('#fee-rate-input-container'),
      footer: requireDomElement<HTMLDivElement>('#footer'),
      mainContent: requireDomElement<HTMLDivElement>('#main-content'),
      network: requireDomElement<HTMLDivElement>('#network-input-container'),
      walletActions: requireDomElement<HTMLDivElement>('#wallet-actions'),
    }

    const inputs = {
      address: requireDomElement<HTMLInputElement>('#address-input'),
      change: requireDomElement<HTMLInputElement>('#change-input'),
      electrum: requireDomElement<HTMLInputElement>('#electrum-input'),
      feeRate: requireDomElement<HTMLInputElement>('#fee-rate-input'),
      networkRadios: requireDomElements<HTMLInputElement>('input[name="network"]'),
      receive: requireDomElement<HTMLInputElement>('#receive-input'),
    }

    const links = {
      about: requireDomElement<HTMLAnchorElement>('#about-link'),
    }

    const modals = {
      autoChange: requireDomElement<HTMLDialogElement>('#auto-change-modal'),
      autoElectrum: requireDomElement<HTMLDialogElement>('#auto-electrum-modal'),
      electrumServer: requireDomElement<HTMLDialogElement>('#electrum-server-modal'),
      feeRate: requireDomElement<HTMLDialogElement>('#fee-rate-modal'),
      network: requireDomElement<HTMLDialogElement>('#network-modal'),
      transactions: requireDomElement<HTMLDialogElement>('#transactions-modal'),
      walletConfig: requireDomElement<HTMLDialogElement>('#wallet-config-modal'),
    }

    const outputs = {
      conversation: requireDomElement<HTMLDivElement>('#conversation'),
      psbtSignHistory: requireDomElement<HTMLUListElement>('#psbt-sign-history'),
      psbtStatus: requireDomElement<HTMLDivElement>('#psbt-status'),
      psbtTextArea: requireDomElement<HTMLTextAreaElement>('#psbt-textarea'),
      tempMessage,
      tempMessageContainer: requireDomElement<HTMLDivElement>('#temp-message-container'),
      transactionOverview: requireDomElement<HTMLDivElement>('#transaction-overview-container'),
      txBody: requireDomElement<HTMLTableSectionElement>('#transactions-body'),
    }

    DOM = {
      buttons,
      checkboxes,
      containers,
      feedback,
      inputs,
      links,
      modals,
      radios,
      outputs,
    }
  } catch (e: unknown) {
    const error = (e as Error) || new Error('Failed to initialize: missing required DOM elements')
    console.error(error)
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
