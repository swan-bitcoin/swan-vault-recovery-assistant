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
typeof SuppressedError === 'function'
  ? SuppressedError
  : function (error, suppressed, message) {
      var e = new Error(message)
      return (e.name = 'SuppressedError'), (e.error = error), (e.suppressed = suppressed), e
    }
async function invoke(cmd, args = {}, options) {
  return window.__TAURI_INTERNALS__.invoke(cmd, args, options)
}
async function writeText(text, opts) {
  await invoke('plugin:clipboard-manager|write_text', {
    label: opts == null ? void 0 : opts.label,
    text,
  })
}
async function readText() {
  return await invoke('plugin:clipboard-manager|read_text')
}
var TauriEvent
;(function (TauriEvent2) {
  TauriEvent2['WINDOW_RESIZED'] = 'tauri://resize'
  TauriEvent2['WINDOW_MOVED'] = 'tauri://move'
  TauriEvent2['WINDOW_CLOSE_REQUESTED'] = 'tauri://close-requested'
  TauriEvent2['WINDOW_DESTROYED'] = 'tauri://destroyed'
  TauriEvent2['WINDOW_FOCUS'] = 'tauri://focus'
  TauriEvent2['WINDOW_BLUR'] = 'tauri://blur'
  TauriEvent2['WINDOW_SCALE_FACTOR_CHANGED'] = 'tauri://scale-change'
  TauriEvent2['WINDOW_THEME_CHANGED'] = 'tauri://theme-changed'
  TauriEvent2['WINDOW_CREATED'] = 'tauri://window-created'
  TauriEvent2['WEBVIEW_CREATED'] = 'tauri://webview-created'
  TauriEvent2['DRAG_ENTER'] = 'tauri://drag-enter'
  TauriEvent2['DRAG_OVER'] = 'tauri://drag-over'
  TauriEvent2['DRAG_DROP'] = 'tauri://drag-drop'
  TauriEvent2['DRAG_LEAVE'] = 'tauri://drag-leave'
})(TauriEvent || (TauriEvent = {}))
const commands = {
  /**
   *
   * * interface functions
   *
   */
  async address(network, descriptor, electrum) {
    return await invoke('address', { network, descriptor, electrum })
  },
  async balance(network, receive, change, electrum) {
    return await invoke('balance', { network, receive, change, electrum })
  },
  async estimateFee(network, electrum) {
    return await invoke('estimate_fee', { network, electrum })
  },
  async broadcast(psbt, network, receive, change, electrum) {
    return await invoke('broadcast', { psbt, network, receive, change, electrum })
  },
  async enumerate(network) {
    return await invoke('enumerate', { network })
  },
  async sign(psbt, network, deviceType) {
    return await invoke('sign', { psbt, network, deviceType })
  },
  async sweep(address, feeRate, network, receive, change, electrum) {
    return await invoke('sweep', { address, feeRate, network, receive, change, electrum })
  },
}
const Success = (text) => `
<div class="flex gap-1 items-center">
  <svg
    xmlns="http://www.w3.org/2000/svg"
    class="h-6 w-6 shrink-0 stroke-current"
    fill="none"
    viewBox="0 0 24 24">
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
  <span>${text}</span>
</div>
`
const Balance = ({ confirmed, unconfirmed }) => {
  return `
      <h1>Your Balance</h1>
      <div class="stat">
        <div class="stat-value">${confirmed} sats</div>
        <div class="stat-desc">Confirmed</div>
      </div>
      <div class="stat">
        <div class="stat-value">${unconfirmed} sats</div>
        <div class="stat-desc">Unconfirmed</div>
      </div>
    `
}
const Address = ({ address }) => {
  return `<span class="break-all">${address}</span>`
}
const showConversation = () => {
  const conversationContainer = document.getElementById('conversation')
  if (conversationContainer) {
    conversationContainer.classList.remove('hidden')
  }
}
const createConversationBubble = (content, isUserSpeaking = false) => {
  const chatContainer = document.createElement('div')
  chatContainer.classList.add('chat', isUserSpeaking ? 'chat-end' : 'chat-start')
  const avatar = document.createElement('div')
  avatar.classList.add('chat-image', 'avatar')
  avatar.innerHTML = `<span class="text-4xl">${isUserSpeaking ? '👨‍💻' : '🍤'}</span>`
  const bubble = document.createElement('div')
  bubble.classList.add('chat-bubble', isUserSpeaking ? 'chat-bubble-secondary' : 'chat-bubble-info')
  bubble.innerHTML = content
  chatContainer.appendChild(avatar)
  chatContainer.appendChild(bubble)
  showConversation()
  return chatContainer
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
  let message = devices.length === 1 ? `Found ` : `Found ${devices.length} devices: [`
  devices.forEach((device, index, arr) => {
    message = message.concat(`a ${device.model} device`)
    if (device.error) {
      message = message.concat(` which is reporting an error: '${device.error}'`)
    } else if (device.fingerprint) {
      message = message.concat(` with fingerprint '${device.fingerprint}'`)
    } else {
      message = message.concat(' no fingerprint')
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
function getSignMessageAndPsbt(val) {
  const signResponse = parseSignResponse(val)
  const message = signResponse.signed ? 'PSBT signed successfully' : 'PSBT not signed'
  return { message, signedPsbt: signResponse.psbt }
}
function parseJson(val) {
  if (typeof val !== 'string') {
    throw new Error(`Expected a JSON string response, found ${typeof val}.
response: ${val}`)
  }
  const parsed = JSON.parse(val)
  if (parsed.error) {
    throw new Error(parsed.error)
  }
  return parsed
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
function parseDeviceResponse(val) {
  const parsed = parseJson(val)
  if (!Array.isArray(parsed) || !parsed.every((item) => isDevice(item))) {
    throw new Error(`Invalid device list found when enumerating devices.
response: ${val}`)
  }
  return parsed
}
const isSignResponse = (item) => {
  if (typeof item !== 'object' || item === null) return false
  const signResponse = item
  return typeof signResponse.psbt === 'string' && typeof signResponse.signed === 'boolean'
}
function parseSignResponse(val) {
  const parsed = parseJson(val)
  if (typeof parsed !== 'object' || !isSignResponse(parsed)) {
    throw new Error(`Invalid response when attempting to sign PSBT.
response: ${val}`)
  }
  return parsed
}
let DOM
function isTempuraError(e) {
  const tempuraError = e
  return !!(tempuraError.error_type && tempuraError.message)
}
function handleError(e) {
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
function getInputs() {
  var _a, _b, _c
  const address = DOM.addressInput.value.trim()
  const recv = DOM.receiveInput.value.trim()
  const change = ((_a = DOM.changeInput) == null ? void 0 : _a.value.trim()) || null
  const electrum = ((_b = DOM.electrumInput) == null ? void 0 : _b.value.trim()) || null
  const feeRate = Number((_c = DOM.feeRateInput) == null ? void 0 : _c.value.trim()) || null
  const network = Array.from(DOM.networkRadios).find((radio) => radio.checked).value
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
function require2(value, itemName) {
  if (!value) {
    const message = itemName.concat(' is required')
    DOM.tempMessage.textContent = message
    throw new Error(message)
  }
}
async function broadcast() {
  const { recv, change, electrum, network, psbt } = getInputs()
  require2(recv, 'Receive Descriptor')
  require2(psbt, 'PSBT')
  DOM.tempMessage.textContent = 'Please wait...'
  try {
    await commands.broadcast(psbt, network, recv, change, electrum)
    DOM.tempMessage.textContent = 'Broadcast successful!'
  } catch (e) {
    handleError(e)
  }
}
async function enumerate() {
  const { network } = getInputs()
  DOM.tempMessage.textContent = 'Please wait... (be sure to check attached devices for prompts)'
  try {
    const response = await commands.enumerate(network)
    DOM.tempMessage.textContent = getDeviceMessage(response)
  } catch (e) {
    handleError(e)
  }
}
async function getBalance() {
  const { recv, change, electrum, network } = getInputs()
  require2(recv, 'Receive Descriptor')
  DOM.tempMessage.textContent = 'Fetching balance ...'
  try {
    const balance = await commands.balance(network, recv, change, electrum)
    DOM.tempMessage.textContent = 'Balance fetched successfully!'
    const tempuraBubble = createConversationBubble(
      Balance({
        confirmed: balance.confirmed,
        unconfirmed: balance.untrusted_pending,
      })
    )
    const userBubble = createConversationBubble('What is my balance?', true)
    DOM.conversation.appendChild(userBubble)
    DOM.conversation.appendChild(tempuraBubble)
  } catch (e) {
    handleError(e)
  }
}
async function getAddress() {
  const { recv, electrum, network } = getInputs()
  require2(recv, 'Receive Descriptor')
  DOM.tempMessage.textContent = 'Getting the next unused address for you ...'
  try {
    const { address } = await commands.address(network, recv, electrum)
    DOM.tempMessage.textContent = 'Address retrieved successfully!'
    const tempuraBubble = createConversationBubble(Address({ address }))
    const userBubble = createConversationBubble('Give me an address!', true)
    DOM.conversation.appendChild(userBubble)
    DOM.conversation.appendChild(tempuraBubble)
  } catch (e) {
    handleError(e)
  }
}
function copyPsbtToClipboard() {
  const psbt = DOM.psbtTextArea.value.trim()
  if (!psbt) {
    DOM.tempMessage.textContent = 'No PSBT to copy'
    return
  }
  writeText(psbt)
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
  } catch (e) {
    handleError(e)
  }
}
function pastePsbtToClipboard() {
  readText()
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
  require2(psbt, 'PSBT')
  DOM.tempMessage.textContent = 'Please wait...'
  try {
    const enumeration = await commands.enumerate(network)
    const device = getDevice(enumeration)
    const response = await commands.sign(psbt, network, device.type)
    const { message, signedPsbt } = getSignMessageAndPsbt(response)
    DOM.psbtTextArea.value = signedPsbt
    DOM.tempMessage.textContent = message
  } catch (e) {
    handleError(e)
  }
}
async function sweep() {
  const inputs = getInputs()
  const { address, recv, change, electrum, network } = inputs
  let { feeRate } = inputs
  require2(recv, 'Receive Descriptor')
  require2(address, 'Address')
  DOM.tempMessage.textContent = 'Please wait...'
  try {
    feeRate = feeRate || (await commands.estimateFee(network, electrum))
    const psbt = await commands.sweep(address, feeRate, network, recv, change, electrum)
    DOM.psbtTextArea.value = psbt.psbt
    DOM.tempMessage.innerHTML = Success('PSBT created!')
  } catch (e) {
    handleError(e)
  }
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
window.addEventListener('DOMContentLoaded', () => {
  let tempMessage = void 0
  try {
    tempMessage = requireDomElement('#temporary-message')
    const conversation = requireDomElement('#conversation')
    const addressInput = requireDomElement('#address-input')
    const changeInput = requireDomElement('#change-input')
    const electrumInput = requireDomElement('#electrum-input')
    const feeRateInput = requireDomElement('#feerate-input')
    const networkRadios = requireDomElements('input[name="network"]')
    const psbtTextArea = requireDomElement('#psbt-textarea')
    const receiveInput = requireDomElement('#receive-input')
    DOM = {
      addressInput,
      changeInput,
      electrumInput,
      feeRateInput,
      tempMessage,
      conversation,
      networkRadios,
      psbtTextArea,
      receiveInput,
    }
    requireDomElement('#estimate-button').addEventListener('click', (e) => {
      e.preventDefault()
      estimateFee()
    })
    requireDomElement('#fetch-balance-button').addEventListener('click', (e) => {
      e.preventDefault()
      getBalance()
    })
    requireDomElement('#new-address-button').addEventListener('click', (e) => {
      e.preventDefault()
      getAddress()
    })
    requireDomElement('#sweep-button').addEventListener('click', (e) => {
      e.preventDefault()
      sweep()
    })
    requireDomElement('#copy-psbt-button').addEventListener('click', (e) => {
      e.preventDefault()
      copyPsbtToClipboard()
    })
    requireDomElement('#paste-psbt-button').addEventListener('click', (e) => {
      e.preventDefault()
      pastePsbtToClipboard()
    })
    requireDomElement('#broadcast-button').addEventListener('click', (e) => {
      e.preventDefault()
      broadcast()
    })
    requireDomElement('#sign-message-button').addEventListener('click', (e) => {
      e.preventDefault()
      sign()
    })
    requireDomElement('#enumerate-button').addEventListener('click', (e) => {
      e.preventDefault()
      enumerate()
    })
  } catch (e) {
    const error = e || new Error('Failed to initialize: missing required DOM elements')
    if (tempMessage) {
      tempMessage.textContent = error.message
    }
  }
})
