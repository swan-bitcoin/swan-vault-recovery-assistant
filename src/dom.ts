type Buttons = {
  address: HTMLButtonElement
  balance: HTMLButtonElement
  broadcast: HTMLButtonElement
  copyPsbt: HTMLButtonElement
  enumerate: HTMLButtonElement
  estimate: HTMLButtonElement
  pastePsbt: HTMLButtonElement
  sign: HTMLButtonElement
  sweep: HTMLButtonElement
  transactions: HTMLButtonElement
}

type Checkboxes = {
  change: HTMLInputElement
  electrum: HTMLInputElement
  network: HTMLInputElement
}

type Containers = {
  change: HTMLDivElement
  electrum: HTMLDivElement
  network: HTMLDivElement
}

type Inputs = {
  address: HTMLInputElement
  change: HTMLInputElement
  electrum: HTMLInputElement
  feeRate: HTMLInputElement
  networkRadios: NodeListOf<HTMLInputElement>
  receive: HTMLInputElement
}

type Outputs = {
  conversation: HTMLDivElement
  psbtSignHistory: HTMLDivElement
  psbtStatus: HTMLDivElement
  psbtTextArea: HTMLTextAreaElement
  tempMessage: HTMLDivElement
  txBody: HTMLTableSectionElement
  txModal: HTMLDialogElement
}

type DOM = {
  buttons: Buttons
  checkboxes: Checkboxes
  containers: Containers
  inputs: Inputs
  outputs: Outputs
}
export let DOM: DOM

export function initializeDOM() {
  let tempMessage: HTMLDivElement | undefined = undefined
  try {
    tempMessage = requireDomElement<HTMLDivElement>('#temporary-message')

    const buttons = {
      address: requireDomElement<HTMLButtonElement>('#new-address-button'),
      balance: requireDomElement<HTMLButtonElement>('#fetch-balance-button'),
      broadcast: requireDomElement<HTMLButtonElement>('#broadcast-button'),
      copyPsbt: requireDomElement<HTMLButtonElement>('#copy-psbt-button'),
      enumerate: requireDomElement<HTMLButtonElement>('#enumerate-button'),
      estimate: requireDomElement<HTMLButtonElement>('#estimate-button'),
      pastePsbt: requireDomElement<HTMLButtonElement>('#paste-psbt-button'),
      sign: requireDomElement<HTMLButtonElement>('#sign-button'),
      sweep: requireDomElement<HTMLButtonElement>('#sweep-button'),
      transactions: requireDomElement<HTMLButtonElement>('#fetch-transactions-button'),
    }

    const checkboxes = {
      change: requireDomElement<HTMLInputElement>('#auto-change-checkbox'),
      electrum: requireDomElement<HTMLInputElement>('#auto-electrum-checkbox'),
      network: requireDomElement<HTMLInputElement>('#network-checkbox'),
    }

    const containers = {
      change: requireDomElement<HTMLDivElement>('#change-input-container'),
      electrum: requireDomElement<HTMLDivElement>('#electrum-input-container'),
      network: requireDomElement<HTMLDivElement>('#network-input-container'),
    }

    const inputs = {
      address: requireDomElement<HTMLInputElement>('#address-input'),
      change: requireDomElement<HTMLInputElement>('#change-input'),
      electrum: requireDomElement<HTMLInputElement>('#electrum-input'),
      feeRate: requireDomElement<HTMLInputElement>('#feerate-input'),
      networkRadios: requireDomElements<HTMLInputElement>('input[name="network"]'),
      receive: requireDomElement<HTMLInputElement>('#receive-input'),
    }

    const outputs = {
      conversation: requireDomElement<HTMLDivElement>('#conversation'),
      psbtSignHistory: requireDomElement<HTMLDivElement>('#psbt-sign-history'),
      psbtStatus: requireDomElement<HTMLDivElement>('#psbt-status'),
      psbtTextArea: requireDomElement<HTMLTextAreaElement>('#psbt-textarea'),
      tempMessage,
      txBody: requireDomElement<HTMLTableSectionElement>('#transactions-body'),
      txModal: requireDomElement<HTMLDialogElement>('#transactions-modal'),
    }

    DOM = {
      buttons,
      checkboxes,
      containers,
      inputs,
      outputs,
    }
  } catch (e: unknown) {
    const error = (e as Error) || new Error('Failed to initialize: missing required DOM elements')
    if (tempMessage) {
      tempMessage.textContent = error.message
    }
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
