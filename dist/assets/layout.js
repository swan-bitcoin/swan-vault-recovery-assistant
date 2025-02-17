;(function polyfill() {
  const relList = document.createElement('link').relList
  if (relList && relList.supports && relList.supports('modulepreload')) {
    return
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link)
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') {
        continue
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === 'LINK' && node.rel === 'modulepreload') processPreload(node)
      }
    }
  }).observe(document, { childList: true, subtree: true })
  function getFetchOpts(link) {
    const fetchOpts = {}
    if (link.integrity) fetchOpts.integrity = link.integrity
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy
    if (link.crossOrigin === 'use-credentials') fetchOpts.credentials = 'include'
    else if (link.crossOrigin === 'anonymous') fetchOpts.credentials = 'omit'
    else fetchOpts.credentials = 'same-origin'
    return fetchOpts
  }
  function processPreload(link) {
    if (link.ep) return
    link.ep = true
    const fetchOpts = getFetchOpts(link)
    fetch(link.href, fetchOpts)
  }
})()
const DECIMAL_SEP = Number(1.1).toLocaleString().slice(1, 2)
const Sats = (sats) => {
  const satsStr = Math.round(Number(sats)).toString().padStart(9, '0')
  const btcStr = Number.parseInt(satsStr.slice(0, -8)).toLocaleString() + DECIMAL_SEP
  const combinedStr = btcStr + satsStr.slice(-8, -6) + ' ' + satsStr.slice(-6, -3) + ' ' + satsStr.slice(-3)
  const firstNonZeroIndex = combinedStr.search(/[1-9]/)
  const splitIndex = firstNonZeroIndex === -1 ? combinedStr.length : firstNonZeroIndex
  const leading = combinedStr.slice(0, splitIndex)
  const trailing = combinedStr.slice(splitIndex)
  return `₿<span class="opacity-50">${leading}</span>${trailing}`
}
const setThemeBasedOnSystemPreference = () => {
  const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)').matches
  if (prefersDarkScheme) {
    document.documentElement.setAttribute('data-theme', 'halloween')
  } else {
    document.documentElement.setAttribute('data-theme', 'cupcake')
  }
}
let DOM
function clearStatusIndicators(element) {
  element.classList.remove('input-success')
  element.classList.remove('input-error')
  element.classList.remove('input-warning')
  element.classList.remove('textarea-success')
  element.classList.remove('textarea-error')
  element.classList.remove('textarea-warning')
}
function getUserInputs() {
  var _a, _b, _c
  const address = DOM.inputs.address.value.trim()
  const autoChange = DOM.checkboxes.change.checked
  const receive = DOM.inputs.receive.value.trim()
  const change = ((_a = DOM.inputs.change) == null ? void 0 : _a.value.trim()) || null
  const electrum = ((_b = DOM.inputs.electrum) == null ? void 0 : _b.value.trim()) || null
  const feeRate = Number((_c = DOM.inputs.feeRate) == null ? void 0 : _c.value.trim()) || null
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
function handleError(e) {
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
function initializeDOM() {
  let tempMessage = void 0
  try {
    tempMessage = requireDomElement('#temporary-message')
    const feedback = {
      receiveInputValidationMessage: requireDomElement('#receive-input-validation-message'),
    }
    const buttons = {
      broadcast: requireDomElement('#broadcast-button'),
      clearMessages: requireDomElement('#clear-messages-button'),
      copyPsbt: requireDomElement('#copy-psbt-button'),
      enumerate: requireDomElement('#enumerate-button'),
      estimate: requireDomElement('#estimate-button'),
      load: requireDomElement('#fetch-wallet-button'),
      modals: {
        autoChange: requireDomElement('#auto-change-modal-button'),
        autoElectrum: requireDomElement('#auto-electrum-modal-button'),
        electrumServer: requireDomElement('#electrum-server-modal-button'),
        feeRate: requireDomElement('#fee-rate-modal-button'),
        network: requireDomElement('#network-modal-button'),
        walletConfig: requireDomElement('#wallet-config-modal-button'),
      },
      pastePsbt: requireDomElement('#paste-psbt-button'),
      sign: requireDomElement('#sign-button'),
      sweep: requireDomElement('#sweep-button'),
    }
    const checkboxes = {
      change: requireDomElement('#auto-change-checkbox'),
      electrum: requireDomElement('#auto-electrum-checkbox'),
      feeRate: requireDomElement('#auto-fee-rate-checkbox'),
      network: requireDomElement('#network-checkbox'),
    }
    const radios = {
      walletConfigurationCollapse: requireDomElement('#wallet-configuration-collapse-radio'),
      recoveryOptionsCollapse: requireDomElement('#recovery-options-collapse-radio'),
      sendTransactionCollapse: requireDomElement('#send-transaction-collapse-radio'),
    }
    const containers = {
      change: requireDomElement('#change-input-container'),
      electrum: requireDomElement('#electrum-input-container'),
      feeRate: requireDomElement('#fee-rate-input-container'),
      footer: requireDomElement('#footer'),
      mainContent: requireDomElement('#main-content'),
      network: requireDomElement('#network-input-container'),
      toast: requireDomElement('#toast-container'),
      walletActions: requireDomElement('#wallet-actions'),
    }
    const inputs = {
      address: requireDomElement('#address-input'),
      change: requireDomElement('#change-input'),
      electrum: requireDomElement('#electrum-input'),
      feeRate: requireDomElement('#fee-rate-input'),
      networkRadios: requireDomElements('input[name="network"]'),
      receive: requireDomElement('#receive-input'),
    }
    const links = {
      about: requireDomElement('#about-link'),
    }
    const modals = {
      autoChange: requireDomElement('#auto-change-modal'),
      autoElectrum: requireDomElement('#auto-electrum-modal'),
      electrumServer: requireDomElement('#electrum-server-modal'),
      feeRate: requireDomElement('#fee-rate-modal'),
      network: requireDomElement('#network-modal'),
      transactions: requireDomElement('#transactions-modal'),
      walletConfig: requireDomElement('#wallet-config-modal'),
    }
    const outputs = {
      conversation: requireDomElement('#conversation'),
      psbtSignHistory: requireDomElement('#psbt-sign-history'),
      psbtStatus: requireDomElement('#psbt-status'),
      psbtTextArea: requireDomElement('#psbt-textarea'),
      tempMessage,
      tempMessageContainer: requireDomElement('#temp-message-container'),
      transactionOverview: requireDomElement('#transaction-overview-container'),
      txBody: requireDomElement('#transactions-body'),
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
  } catch (e) {
    const error = e || new Error('Failed to initialize: missing required DOM elements')
    console.error(error)
    if (tempMessage) {
      tempMessage.textContent = error.message
    }
  }
}
function isTempuraError(e) {
  const tempuraError = e
  return !!(tempuraError.error_type && tempuraError.message)
}
function requireDomElement(name) {
  const element = document.querySelector(name)
  if (!element) {
    throw new Error(`Failed to initialize: missing required DOM element ${name}`)
  }
  return element
}
function requireDomElements(name) {
  const elements = document.querySelectorAll(name)
  if (elements.length === 0) {
    throw new Error(`Failed to initialize: missing required DOM element ${name}`)
  }
  return elements
}
const showTempMessage = (content) => {
  DOM.outputs.tempMessage.textContent = content
  DOM.outputs.tempMessageContainer.classList.remove('hidden')
}
const adjustMainContentHeight = () => {
  const availableHeight = window.innerHeight - DOM.containers.footer.offsetHeight
  DOM.containers.mainContent.style.height = `${availableHeight}px`
}
window.addEventListener('load', adjustMainContentHeight)
window.addEventListener('resize', adjustMainContentHeight)
document.addEventListener('DOMContentLoaded', () => {
  setThemeBasedOnSystemPreference()
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (e.matches) {
      document.documentElement.setAttribute('data-theme', 'halloween')
    } else {
      document.documentElement.setAttribute('data-theme', 'cupcake')
    }
  })
})
export { DOM as D, Sats as S, clearStatusIndicators as c, getUserInputs as g, handleError as h, initializeDOM as i }
