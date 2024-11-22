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
let DOM
function initializeDOM() {
  let tempMessage = void 0
  try {
    tempMessage = requireDomElement('#temporary-message')
    const buttons = {
      address: requireDomElement('#new-address-button'),
      balance: requireDomElement('#fetch-balance-button'),
      broadcast: requireDomElement('#broadcast-button'),
      copyPsbt: requireDomElement('#copy-psbt-button'),
      enumerate: requireDomElement('#enumerate-button'),
      estimate: requireDomElement('#estimate-button'),
      pastePsbt: requireDomElement('#paste-psbt-button'),
      sign: requireDomElement('#sign-button'),
      sweep: requireDomElement('#sweep-button'),
      transactions: requireDomElement('#fetch-transactions-button'),
    }
    const checkboxes = {
      change: requireDomElement('#auto-change-checkbox'),
      electrum: requireDomElement('#auto-electrum-checkbox'),
      network: requireDomElement('#network-checkbox'),
    }
    const containers = {
      change: requireDomElement('#change-input-container'),
      electrum: requireDomElement('#electrum-input-container'),
      network: requireDomElement('#network-input-container'),
    }
    const inputs = {
      address: requireDomElement('#address-input'),
      change: requireDomElement('#change-input'),
      electrum: requireDomElement('#electrum-input'),
      feeRate: requireDomElement('#feerate-input'),
      networkRadios: requireDomElements('input[name="network"]'),
      receive: requireDomElement('#receive-input'),
    }
    const outputs = {
      conversation: requireDomElement('#conversation'),
      psbtSignHistory: requireDomElement('#psbt-sign-history'),
      psbtStatus: requireDomElement('#psbt-status'),
      psbtTextArea: requireDomElement('#psbt-textarea'),
      tempMessage,
      transactionOverview: requireDomElement('#transaction-overview-container'),
      txBody: requireDomElement('#transactions-body'),
      txModal: requireDomElement('#transactions-modal'),
    }
    DOM = {
      buttons,
      checkboxes,
      containers,
      inputs,
      outputs,
    }
  } catch (e) {
    const error = e || new Error('Failed to initialize: missing required DOM elements')
    if (tempMessage) {
      tempMessage.textContent = error.message
    }
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
  async balance(network, descriptors, electrum) {
    return await invoke('balance', { network, descriptors, electrum })
  },
  async broadcast(psbt, network, descriptors, electrum) {
    return await invoke('broadcast', { psbt, network, descriptors, electrum })
  },
  async enumerate(network) {
    return await invoke('enumerate', { network })
  },
  async estimateFee(network, electrum, blocks) {
    return await invoke('estimate_fee', { network, electrum, blocks })
  },
  async isAddress(address) {
    return await invoke('is_address', { address })
  },
  async isAddressForNetwork(address, network) {
    return await invoke('is_address_for_network', { address, network })
  },
  async isAddressMine(address, network, descriptors) {
    return await invoke('is_address_mine', { address, network, descriptors })
  },
  async isDescriptor(descriptor) {
    return await invoke('is_descriptor', { descriptor })
  },
  async isDescriptorForNetwork(descriptor, network) {
    return await invoke('is_descriptor_for_network', { descriptor, network })
  },
  async isPsbt(psbt) {
    return await invoke('is_psbt', { psbt })
  },
  async psbtStatus(psbt, network, descriptors) {
    return await invoke('psbt_status', { psbt, network, descriptors })
  },
  async sign(psbt, network, deviceType) {
    return await invoke('sign', { psbt, network, deviceType })
  },
  async sweep(address, feeRate, network, descriptors, electrum) {
    return await invoke('sweep', { address, feeRate, network, descriptors, electrum })
  },
  async transactions(network, descriptors, electrum) {
    return await invoke('transactions', { network, descriptors, electrum })
  },
  async createWindow(label, html, title, width, height) {
    await invoke('create_window', { label, html, title, width, height })
  },
}
const innerPaths = `
<!-- Clipboard Icon Path -->
<path d="M 16 3 C 14.742188 3 13.847656 3.890625 13.40625 5 L 6 5 L 6 28 L 26 28 L 26 5 L 18.59375 5 C 18.152344 3.890625 17.257813 3 16 3 Z M 16 5 C 16.554688 5 17 5.445313 17 6 L 17 7 L 20 7 L 20 9 L 12 9 L 12 7 L 15 7 L 15 6 C 15 5.445313 15.445313 5 16 5 Z M 8 7 L 10 7 L 10 11 L 22 11 L 22 7 L 24 7 L 24 26 L 8 26 Z" />
<!-- Checkmark Path inside Clipboard -->
<path d="M 12.5 17.5 l 3 3 l 5 -5" stroke="white" stroke-width="2" fill="none" class="hidden" id="checkmark"/>
`
const CopyButton = (value) => `
    <div class="tooltip tooltip-accent" data-tip="Copy">
      <button class="btn btn-square btn-sm btn-info" name="copy", value="${value}">
        <svg class="h-6 w-6 fill-current transition-transform duration-300 ease-in-out" id="copy-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
          ${innerPaths}
        </svg>
      </button>
    </div>
  </div>
`
const CopyButtonXs = (value) => `
    <div class="tooltip tooltip-accent" data-tip="Copy">
      <button class="btn btn-square btn-xs btn-info" name="copy", value="${value}">
        <svg class="h-3 w-3 fill-current transition-transform duration-300 ease-in-out" id="copy-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
          <g transform="scale(0.5)">${innerPaths}</g>
        </svg>
      </button>
    </div>
  </div>
`
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
const receivedIcon = `
<div class="tooltip tooltip-success tooltip-right" data-tip="Received">
  <div class="text-success">
    <svg xmlns="http://www.w3.org/2000/svg" x-bind:width="size" x-bind:height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" x-bind:stroke-width="stroke" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" stroke-width="2">
      <path d="M14 3v4a1 1 0 0 0 1 1h4"></path>
      <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"></path>
      <path d="M12 17v-6"></path>
      <path d="M9.5 14.5l2.5 2.5l2.5 -2.5"></path>
    </svg>
  </div>
</div>
`
const sentIcon = `
<div class="tooltip tooltip-warning tooltip-right" data-tip="Sent">
  <div class="text-warning">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24">
      <path d="M15 10l-4 4l6 6l4 -16l-18 7l4 2l2 6l3 -4"></path>
    </svg>
  </div>
</div>
`
const selfTransferIcon = `
<div class="tooltip tooltip-info tooltip-right" data-tip="Self-transfer">
  <div class="text-info">
    <svg xmlns="http://www.w3.org/2000/svg" x-bind:width="size" x-bind:height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" x-bind:stroke-width="stroke" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" stroke-width="2">
      <path d="M9 11l-4 4l4 4m-4 -4h11a4 4 0 0 0 0 -8h-1"></path>
    </svg>
  </div>
</div>
`
const simpleCheckmark = `
<svg class="inline w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 12l5 5L20 7"></path>
</svg>
`
const TxRow = (transaction) => {
  const transactionType =
    transaction.sent === transaction.fee ? 'selfTransfer' : Number(transaction.received) > 0 ? 'received' : 'sent'
  return `
      <tr>
        <td>
          ${transactionType === 'selfTransfer' ? selfTransferIcon : transactionType === 'sent' ? sentIcon : receivedIcon}
        </td>
        <td>${transaction.txid}</td>
        <td>${CopyButtonXs(transaction.txid)}</td>
        <td>
          ${transactionType === 'selfTransfer' ? '' : transactionType === 'sent' ? Sats(transaction.sent) : Sats(transaction.received)}
        </td>
        <td>${Sats(transaction.fee)}</td>
        <td>${transaction.confirmation_height || 'Unconfirmed'}</td>
      </tr>
    `
}
const Transactions = (transactions) => transactions.map(TxRow).join('\n')
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
        <div class="stat-value">${Sats(confirmed)}</div>
        <div class="stat-desc">Confirmed</div>
      </div>
      <div class="stat">
        <div class="stat-value">${Sats(unconfirmed)}</div>
        <div class="stat-desc">Unconfirmed</div>
      </div>
    `
}
const Address = ({ address }) => {
  return `
    <div class="flex items-center space-x-2 relative">
      <span class="break-all">${address}</span>
      ${CopyButton(address)}
    </div>
  `
}
const showConversation = () => {
  const conversationContainer = document.getElementById('conversation')
  if (conversationContainer) {
    conversationContainer.classList.remove('hidden')
  }
}
const showClearMessagesButton = () => {
  const clearMessagesButton = document.getElementById('clear-messages-btn')
  if (clearMessagesButton) {
    clearMessagesButton.classList.remove('hidden')
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
  showClearMessagesButton()
  return chatContainer
}
const isChangeDescriptor = (descriptor) => {
  const changePattern = /\/1\/\*\)+(?:#\w+)?$/
  return changePattern.test(descriptor)
}
const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1)
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
const populateTransactionOverview = ({ address, outbound, fee }) => {
  const transactionRowTds = document.querySelectorAll('#transaction-overview-body tr td')
  transactionRowTds[0].textContent = address
  transactionRowTds[1].innerHTML = Sats(outbound)
  transactionRowTds[2].innerHTML = Sats(fee)
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
    message = message.concat(`${device.model} device `)
    if (device.error) {
      message = message.concat(`which is reporting an error: '${device.error}'`)
    } else if (device.fingerprint) {
      message = message.concat(`with fingerprint '${device.fingerprint}'`)
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
      message = 'The PSBT is unsigned.'
      break
    case 'PartiallySigned':
      message =
        'The transaction is partially signed. You need to add the signature from another key before you can broadcast it.'
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
    ? Success('Signature added')
    : 'A signature was not added, have you already signed with this device?'
  return { message, psbt: signResponse.psbt, signed: signResponse.signed }
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
const FEE_RATE_WARNING_RATIO = 0.9
function isTempuraError(e) {
  const tempuraError = e
  return !!(tempuraError.error_type && tempuraError.message)
}
function handleError(e) {
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
    DOM.inputs.receive.classList.add('textarea-success')
    DOM.inputs.receive.classList.remove('textarea-error')
    DOM.inputs.receive.classList.remove('textarea-warning')
    DOM.outputs.tempMessage.textContent =
      'Your wallet configuration is valid. You can now fetch your balance and perform other actions.'
    recoveryOptionsCard.classList.remove('hidden')
    standardWalletActions.classList.remove('hidden')
    return true
  } catch (e) {
    console.error(e)
    DOM.outputs.tempMessage.textContent = 'Invalid wallet configuration!'
    DOM.inputs.receive.classList.add('textarea-error')
    DOM.inputs.receive.classList.remove('textarea-success')
    DOM.inputs.receive.classList.remove('textarea-warning')
    return false
  }
}
async function getFeeRate() {
  const { feeRate, network, electrum } = getInputs()
  let estimate
  try {
    estimate = await commands.estimateFee(network, electrum, 1)
  } catch {
    const failed = feeRate === null
    const warning = failed
      ? void 0
      : 'Warning: The specified fee rate could not be checked       against the current network rates. Please double-check       this is the value you wish to use!'
    return { value: feeRate, warning, failed }
  }
  if (typeof feeRate !== 'number') {
    return { value: estimate }
  }
  if (feeRate < estimate * FEE_RATE_WARNING_RATIO) {
    return {
      value: feeRate,
      warning:
        'Warning: The specified fee rate is lower than recommended.         Please double-check this value. Low fee rates may         cause delays in transaction confirmation.',
    }
  }
  return { value: feeRate }
}
const updateSignHistory = (device) => {
  const newStep = document.createElement('li')
  newStep.classList.add('step', 'step-info')
  newStep.innerHTML = `Signed by ${capitalize(device.type)} device (${device.fingerprint})`
  const stepsList = DOM.outputs.psbtSignHistory
  stepsList.appendChild(newStep)
}
function getInputs() {
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
function require2(value, itemName) {
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
  require2(psbt, 'PSBT')
  DOM.outputs.tempMessage.textContent = 'Please wait...'
  try {
    const userBubble = createConversationBubble('Broadcast the transaction from this PSBT', true)
    DOM.outputs.conversation.appendChild(userBubble)
    await commands.broadcast(psbt, network, descriptors, electrum)
    const tempuraBubble = createConversationBubble('Broadcast successful!')
    DOM.outputs.conversation.appendChild(tempuraBubble)
    DOM.outputs.tempMessage.textContent = 'Anything else?'
  } catch (e) {
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
  } catch (e) {
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
  } catch (e) {
    handleError(e)
  }
}
function instrumentCopyButtons(parent) {
  parent.querySelectorAll('button[name=copy]').forEach((copyButton) => {
    copyButton.addEventListener('click', () => {
      writeText(copyButton.getAttribute('value'))
        .then(() => {
          const tooltip = copyButton.closest('.tooltip')
          tooltip.setAttribute('data-tip', 'Copied')
          const copyIcon = copyButton.querySelector('#copy-icon')
          copyIcon.classList.add('copied')
          const checkmark = copyIcon.querySelector('#checkmark')
          checkmark.classList.remove('hidden')
          setTimeout(() => {
            tooltip.setAttribute('data-tip', 'Copy')
            checkmark.classList.add('hidden')
            copyIcon.classList.remove('copied')
          }, 2e3)
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
    const showListButton = tempuraBubble.querySelector('#show-transactions-btn')
    showListButton == null
      ? void 0
      : showListButton.addEventListener('click', () => {
          DOM.outputs.txModal.showModal()
        })
    instrumentCopyButtons(DOM.outputs.txBody)
  } catch (e) {
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
  } catch (e) {
    handleError(e)
  }
}
function copyPsbtToClipboard() {
  const psbt = DOM.outputs.psbtTextArea.value.trim()
  if (!psbt) {
    DOM.outputs.tempMessage.textContent = 'No PSBT to copy'
    return
  }
  writeText(psbt)
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
  } catch (e) {
    handleError(e)
  }
}
function pastePsbtFromClipboard() {
  readText()
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
function clearStatusIndicators(element) {
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
  } catch (e) {
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
  require2(psbt, 'PSBT')
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
    const psbtStatus = await commands.psbtStatus(responsePsbt, network, descriptors)
    DOM.outputs.tempMessage.textContent = getPsbtStatusMessage(psbtStatus)
  } catch (e) {
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
  require2(address, 'Address')
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
    DOM.outputs.transactionOverview.classList.remove('hidden')
    populateTransactionOverview({ address: DOM.inputs.address.value, outbound, fee })
    DOM.outputs.psbtTextArea.value = psbt
    validatePsbt()
    DOM.outputs.transactionOverview.scrollIntoView({ behavior: 'smooth' })
    DOM.outputs.tempMessage.textContent = 'Sign next?'
    const tempuraBubble = createConversationBubble(Success('Transaction (PSBT) created!'))
    DOM.outputs.conversation.appendChild(tempuraBubble)
    if (feeRate.warning) {
      const warningBubble = createConversationBubble(feeRate.warning)
      DOM.outputs.conversation.appendChild(warningBubble)
    }
  } catch (e) {
    handleError(e)
  }
}
async function validateAddress() {
  const { address, descriptors, network } = getInputs()
  DOM.inputs.address.classList.remove('input-success')
  DOM.inputs.address.classList.remove('input-error')
  DOM.inputs.address.classList.remove('input-warning')
  if (!address) {
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
  } catch (e) {
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
  DOM.inputs.receive.addEventListener('blur', validateDescriptor)
  DOM.inputs.receive.addEventListener('input', () => {
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
  const config = { childList: true }
  const callback = (mutationList) => {
    for (const mutation of mutationList) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        scrollToLastMessage()
      }
    }
  }
  const observer = new MutationObserver(callback)
  observer.observe(DOM.outputs.conversation, config)
  const clearMessagesBtn = document.getElementById('clear-messages-btn')
  clearMessagesBtn.addEventListener('click', () => {
    DOM.outputs.conversation.innerHTML = ''
    DOM.outputs.tempMessage.textContent = 'All messages cleared 🫡'
    clearMessagesBtn.classList.add('hidden')
  })
})
const adjustMainContentHeight = () => {
  const footer = document.getElementById('footer')
  const mainContent = document.getElementById('main-content')
  if (footer && mainContent) {
    const availableHeight = window.innerHeight - footer.offsetHeight
    mainContent.style.height = `${availableHeight}px`
  }
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
  const aboutLink = document.getElementById('about-link')
  aboutLink.addEventListener('click', async (event) => {
    event.preventDefault()
    await commands.createWindow('about', 'about.html', 'About Tempura', 800, 600)
  })
})
