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
  async broadcast(psbt, network, receive, change, electrum) {
    return await invoke('broadcast', { psbt, network, receive, change, electrum })
  },
  async enumerate(network) {
    return await invoke('enumerate', { network })
  },
  async estimateFee(network, electrum) {
    return await invoke('estimate_fee', { network, electrum })
  },
  async isDescriptor(descriptor) {
    return await invoke('is_descriptor', { descriptor })
  },
  async isDescriptorForNetwork(descriptor, network) {
    return await invoke('is_descriptor_for_network', { descriptor, network })
  },
  async sign(psbt, network, deviceType) {
    return await invoke('sign', { psbt, network, deviceType })
  },
  async sweep(address, feeRate, network, receive, change, electrum) {
    return await invoke('sweep', { address, feeRate, network, receive, change, electrum })
  },
  async transactions(network, receive, change, electrum) {
    return await invoke('transactions', { network, receive, change, electrum })
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
const isChangeDescriptor = (descriptor) => {
  const changePattern = /\/1\/\*\)\)#\w+$/
  return changePattern.test(descriptor)
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
function getSignMessageAndPsbt(val) {
  const signResponse = parseSignResponse(val)
  const message = signResponse.signed ? 'PSBT signed successfully' : 'PSBT not signed'
  return { message, psbt: signResponse.psbt }
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
const validateDescriptor = async () => {
  const descriptor = DOM.receiveInput.value
  const network = Array.from(DOM.networkRadios).find((radio) => radio.checked).value
  const standardWalletActions = document.getElementById('standard-wallet-actions')
  const recoveryOptionsCard = document.getElementById('recovery-options-card')
  if (!descriptor) {
    DOM.tempMessage.textContent = 'Wallet configuration is missing!'
    DOM.receiveInput.classList.add('textarea-error')
    DOM.receiveInput.classList.remove('textarea-success')
    DOM.receiveInput.classList.remove('textarea-warning')
    return false
  }
  try {
    const isValidDescriptor = await commands.isDescriptorForNetwork(descriptor, network)
    if (!isValidDescriptor) {
      DOM.tempMessage.textContent =
        'Descriptor is fine but it is for the wrong network. Switch to Advanced Mode to change the network!'
      DOM.receiveInput.classList.add('textarea-error')
      DOM.receiveInput.classList.remove('textarea-success')
      DOM.receiveInput.classList.remove('textarea-warning')
      return false
    }
    if (isChangeDescriptor(descriptor)) {
      DOM.tempMessage.textContent =
        'You seem to be using a change descriptor for your wallet configuration. This may limit wallet functionality, such as showing only a partial balance instead of the full wallet balance.'
      DOM.receiveInput.classList.add('textarea-warning')
      DOM.receiveInput.classList.remove('textarea-success')
      DOM.receiveInput.classList.remove('textarea-error')
      recoveryOptionsCard.classList.remove('hidden')
      standardWalletActions.classList.remove('hidden')
      return true
    }
    DOM.receiveInput.classList.add('textarea-success')
    DOM.receiveInput.classList.remove('textarea-error')
    DOM.receiveInput.classList.remove('textarea-warning')
    DOM.tempMessage.textContent =
      'Your wallet configuration is valid. You can now fetch your balance and perform other actions.'
    recoveryOptionsCard.classList.remove('hidden')
    standardWalletActions.classList.remove('hidden')
    return true
  } catch {
    DOM.tempMessage.textContent = 'Invalid wallet configuration!'
    DOM.receiveInput.classList.add('textarea-error')
    DOM.receiveInput.classList.remove('textarea-success')
    DOM.receiveInput.classList.remove('textarea-warning')
    return false
  }
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
  const isValid = await validateDescriptor()
  if (!isValid) return
  require2(psbt, 'PSBT')
  DOM.tempMessage.textContent = 'Please wait...'
  try {
    const userBubble = createConversationBubble('Broadcast the transaction from this PSBT', true)
    DOM.conversation.appendChild(userBubble)
    await commands.broadcast(psbt, network, recv, change, electrum)
    const tempuraBubble = createConversationBubble('Broadcast successful!')
    DOM.conversation.appendChild(tempuraBubble)
    DOM.tempMessage.textContent = 'Anything else?'
  } catch (e) {
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
  } catch (e) {
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
    const tempuraBubble = createConversationBubble(
      `${transactions.length} transactions fetched <button class="btn btn-sm btn-link" id="show-transactions-btn">Show List</button>`
    )
    DOM.conversation.appendChild(tempuraBubble)
    const showListButton = tempuraBubble.querySelector('#show-transactions-btn')
    showListButton == null
      ? void 0
      : showListButton.addEventListener('click', () => {
          DOM.txModal.showModal()
        })
    instrumentCopyButtons(DOM.txBody)
  } catch (e) {
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
  } catch (e) {
    handleError(e)
  }
}
async function sweep() {
  const inputs = getInputs()
  const { address, recv, change, electrum, network } = inputs
  let { feeRate } = inputs
  const isValid = await validateDescriptor()
  if (!isValid) return
  require2(address, 'Address')
  DOM.tempMessage.textContent = 'Please wait...'
  try {
    const userBubble = createConversationBubble(
      `Create a transaction (PSBT) sending all wallet funds to <span class="break-all">${address}</span>`,
      true
    )
    DOM.conversation.appendChild(userBubble)
    feeRate = feeRate || (await commands.estimateFee(network, electrum))
    const psbt = await commands.sweep(address, feeRate, network, recv, change, electrum)
    DOM.psbtTextArea.value = psbt.psbt
    DOM.tempMessage.textContent = 'Sign next?'
    const tempuraBubble = createConversationBubble(Success('Transaction (PSBT) created!'))
    DOM.conversation.appendChild(tempuraBubble)
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
    const txBody = requireDomElement('#transactions-body')
    const txModal = requireDomElement('#transactions-modal')
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
      txBody,
      txModal,
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
    requireDomElement('#fetch-transactions-button').addEventListener('click', (e) => {
      e.preventDefault()
      getTransactions()
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
    receiveInput.addEventListener('blur', validateDescriptor)
    receiveInput.addEventListener('input', validateDescriptor)
    DOM.networkRadios.forEach((radio) => {
      radio.addEventListener('change', validateDescriptor)
    })
  } catch (e) {
    const error = e || new Error('Failed to initialize: missing required DOM elements')
    if (tempMessage) {
      tempMessage.textContent = error.message
    }
  }
})
