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
  return `₿<span class="opacity-70">${leading}</span>${trailing}`
}
const CircularTickIcon = `<svg
    xmlns="http://www.w3.org/2000/svg"
    class="h-6 w-6 shrink-0 stroke-current"
    fill="none"
    viewBox="0 0 24 24">
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>`
const Success = (text) => `
<div class="flex gap-1 items-center">
  ${CircularTickIcon}
  <span>${text}</span>
</div>
`
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
  if (isSvraError(e)) {
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
      addressInputValidationMessage: requireDomElement('#address-input-validation-message'),
      psbtInputValidationMessage: requireDomElement('#psbt-input-validation-message'),
    }
    const buttons = {
      advancedMode: requireDomElement('#advanced-mode-button'),
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
      github: requireDomElement('#github-link'),
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
function isSvraError(e) {
  const SvraError2 = e
  return !!(SvraError2.error_type && SvraError2.message)
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
const scrollToLastMessage = () => {
  const conversationContainer = document.getElementById('conversation')
  if (conversationContainer && conversationContainer.lastElementChild) {
    conversationContainer.lastElementChild.scrollIntoView({ behavior: 'smooth' })
  }
}
const setThemeBasedOnSystemPreference = () => {
  const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)').matches
  if (prefersDarkScheme) {
    document.documentElement.setAttribute('data-theme', 'halloween')
  } else {
    document.documentElement.setAttribute('data-theme', 'cupcake')
  }
}
function getDevice(val) {
  const devices = parseDeviceResponse(val)
  if (devices.length === 0) {
    throw new Error('No devices found')
  }
  if (devices.length > 1) {
    throw new Error('Multiple devices found. Please unplug all but one device.')
  }
  const device = devices[0]
  if (device.error) {
    throw new Error(`Device error: ${device.error}`)
  }
  return device
}
function getDeviceMessage(val) {
  const devices = parseDeviceResponse(val)
  if (devices.length === 0) {
    return 'No devices found'
  }
  let message = devices.length === 1 ? `Found a ` : `Found ${devices.length} devices: [`
  devices.forEach((device, index, arr) => {
    message = message.concat(`${sanitize(device.model)} device `)
    if (device.error) {
      message = message.concat(`which is reporting an error: '${sanitize(device.error)}'`)
    } else if (device.fingerprint) {
      message = message.concat(`with fingerprint '${sanitize(device.fingerprint)}'`)
    } else {
      message = message.concat('with no fingerprint')
    }
    if (index < arr.length - 1) {
      message = message.concat(', ')
    }
  })
  if (devices.length > 1) {
    message = message.concat(']')
  }
  return message
}
function getDevicePrompt(val) {
  const devices = parseDeviceResponse(val)
  if (devices.length === 0) {
    return 'Make sure your device is connected. Perhaps try a different cable.'
  }
  if (devices.length === 1) {
    return 'You may want to sign with this device next...'
  }
  return 'Make sure only one device is connected.'
}
function getPsbtStatusMessage(status) {
  let message
  switch (status) {
    case 'Unsigned':
      message = 'The transaction still is unsigned.'
      break
    case 'PartiallySigned':
      message =
        'The transaction is now partially signed. You need to add the signature from another key before you can broadcast it.'
      break
    case 'FullySigned':
      message = 'The transaction is fully signed 🎉. You can broadcast it now.'
      break
    default:
      message = 'The PSBT is in an unknown state.'
      break
  }
  return message
}
function getSignResultAndPsbt(val) {
  const signResponse = parseSignResponse(val)
  const message = signResponse.signed
    ? Success('Great! Added a signature to the transaction.')
    : 'A signature was not added, have you already signed with this device?'
  return { message, psbt: signResponse.psbt, signed: signResponse.signed }
}
function sanitize(input) {
  const map = /* @__PURE__ */ new Map([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ["'", '&#039;'],
  ])
  return input.replace(/[&<>"']/g, (m) => {
    return map.get(m) || m
  })
}
const isDevice = (item) => {
  if (typeof item !== 'object' || item === null) return false
  const device = item
  return (
    typeof device.type === 'string' &&
    typeof device.model === 'string' &&
    typeof device.path === 'string' &&
    typeof device.needs_pin_sent === 'boolean' &&
    typeof device.needs_passphrase_sent === 'boolean'
  )
}
const isSignResponse = (item) => {
  if (typeof item !== 'object' || item === null) return false
  const signResponse = item
  return typeof signResponse.psbt === 'string' && typeof signResponse.signed === 'boolean'
}
function parseDeviceResponse(val) {
  const parsed = parseJson(val)
  if (!Array.isArray(parsed) || !parsed.every((item) => isDevice(item))) {
    throw new Error(`Invalid device list found when enumerating devices.
response: ${val}`)
  }
  return parsed
}
function parseJson(val) {
  if (typeof val !== 'string') {
    throw new Error(`Expected a JSON string response, found ${typeof val}.
response: ${val}`)
  }
  const parsed = JSON.parse(val)
  if (parsed == null ? void 0 : parsed.error) {
    throw new Error(parsed.error)
  }
  return parsed
}
function parseSignResponse(val) {
  const parsed = parseJson(val)
  if (!isSignResponse(parsed)) {
    throw new Error(`Invalid response when attempting to sign PSBT.
response: ${val}`)
  }
  return parsed
}
const hideTempMessage = () => {
  DOM.outputs.tempMessageContainer.classList.add('hidden')
}
const showTempMessage = (content) => {
  DOM.outputs.tempMessage.textContent = content
  DOM.outputs.tempMessageContainer.classList.remove('hidden')
  scrollToLastMessage()
}
const showTempLoadingMessage = (content) => {
  DOM.outputs.tempMessage.innerHTML = `<div class="flex items-center gap-2">${content ? `<span>${sanitize(content)}</span>` : ''}<span class="loading loading-spinner loading-sm opacity-70"></span></div>`
  DOM.outputs.tempMessageContainer.classList.remove('hidden')
  scrollToLastMessage()
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
export {
  CircularTickIcon as C,
  DOM as D,
  Sats as S,
  sanitize as a,
  showTempLoadingMessage as b,
  clearStatusIndicators as c,
  hideTempMessage as d,
  getDeviceMessage as e,
  getDevicePrompt as f,
  getUserInputs as g,
  handleError as h,
  initializeDOM as i,
  getDevice as j,
  getSignResultAndPsbt as k,
  getPsbtStatusMessage as l,
  scrollToLastMessage as s,
}
