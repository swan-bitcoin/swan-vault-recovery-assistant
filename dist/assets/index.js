import {
  S as Sats,
  D as DOM,
  s as scrollToLastMessage,
  g as getUserInputs,
  c as clearStatusIndicators,
  h as handleError,
  i as initializeDOM,
  a as showTempLoadingMessage,
  b as hideTempMessage,
} from './layout.js'
typeof SuppressedError === 'function'
  ? SuppressedError
  : function (error, suppressed, message) {
      var e = new Error(message)
      return ((e.name = 'SuppressedError'), (e.error = error), (e.suppressed = suppressed), e)
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
  async address(network, descriptors, electrum) {
    return await invoke('address', { network, descriptors, electrum })
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
  async wallet(network, descriptors, electrum) {
    return await invoke('wallet', { network, descriptors, electrum })
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
    <div class="tooltip tooltip-left tooltip-accent" data-tip="Copy">
      <button class="btn btn-square btn-xs btn-ghost" name="copy", value="${value}">
        <svg class="h-4 w-4 fill-current transition-transform duration-300 ease-in-out" id="copy-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
          <g transform="scale(0.5)">${innerPaths}</g>
        </svg>
      </button>
    </div>
  </div>
`
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
  let transactionType
  if (Number(transaction.sent) === Number(transaction.received) + Number(transaction.fee)) {
    transactionType = 'selfTransfer'
  } else if (Number(transaction.sent) > 0 && Number(transaction.received) > 0) {
    transactionType = 'sent'
  } else if (Number(transaction.received) > 0) {
    transactionType = 'received'
  } else {
    transactionType = 'sent'
  }
  const amount =
    transactionType === 'sent'
      ? `&minus;${Sats(Number(transaction.sent) - Number(transaction.received))}`
      : transactionType === 'received'
        ? `&plus;${Sats(Number(transaction.received))}`
        : `&minus;${Sats(Number(transaction.fee))}`
  return `
      <tr>
        <td>
          ${transactionType === 'selfTransfer' ? selfTransferIcon : transactionType === 'sent' ? sentIcon : receivedIcon}
        </td>
        <td class="text-right [font-variant-numeric:tabular-nums]">${amount}</td>
        <td class="text-right [font-variant-numeric:tabular-nums]">${Sats(transaction.fee)}</td>
        <td class="text-center [font-variant-numeric:tabular-nums]">${transaction.confirmation_height || 'Unconfirmed'}</td>
        <td class="text-center font-mono">${transaction.txid}</td>
        <td>${CopyButtonXs(transaction.txid)}</td>
      </tr>
    `
}
const Transactions = (transactions) => {
  const sortedTransactions = transactions.sort((a, b) => {
    const isAUnconfirmed = a.confirmation_height === null
    const isBUnconfirmed = b.confirmation_height === null
    if (isAUnconfirmed && !isBUnconfirmed) return -1
    if (!isAUnconfirmed && isBUnconfirmed) return 1
    const heightA = a.confirmation_height ?? 0
    const heightB = b.confirmation_height ?? 0
    return heightB - heightA
  })
  return sortedTransactions.map(TxRow).join('\n')
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
const Address = ({ address }) => {
  return `
    <div class="flex items-center space-x-2 relative">
      <span id="wallet-address" class="break-all">${address}</span>
      ${CopyButton(address)}
    </div>
  `
}
function addToConversation(bubble, { shouldScrollToLastMessage = true } = {}) {
  DOM.outputs.conversation.appendChild(bubble)
  if (shouldScrollToLastMessage) {
    scrollToLastMessage()
  }
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
const createConversationBubble = ({ content, footer, isUserSpeaking = false, dangerouslySetInnerHTML = false }) => {
  const chatContainer = document.createElement('div')
  chatContainer.classList.add('chat', 'animate-in', isUserSpeaking ? 'chat-end' : 'chat-start')
  const bubble = document.createElement('div')
  bubble.classList.add('chat-bubble', 'animate-in', 'fade-in', isUserSpeaking ? 'chat-bubble-secondary' : 'chat-bubble-info')
  bubble.classList.add(isUserSpeaking ? 'slide-in-from-right-2' : 'slide-in-from-left-2')
  if (dangerouslySetInnerHTML) {
    if (content instanceof HTMLElement) {
      bubble.appendChild(content)
    } else {
      bubble.innerHTML = content
    }
  } else if (typeof content === 'string') {
    bubble.innerText = content
  }
  chatContainer.appendChild(bubble)
  if (footer) {
    const footerContainer = document.createElement('div')
    footerContainer.classList.add('chat-footer', 'pt-1', 'opacity-70')
    footerContainer.innerText = footer
    chatContainer.appendChild(footerContainer)
  }
  showConversation()
  showClearMessagesButton()
  return chatContainer
}
const getTransactionsButtonBubble = () => ({
  content: `<button id="show-transactions-btn" class="btn btn-outline btn-sm">View Transactions</button>`,
  dangerouslySetInnerHTML: true,
  footer: /* @__PURE__ */ new Date().toLocaleString(),
  type: 'actions',
})
function getUnfundedWalletMessages({ receiveAddress }) {
  return [
    {
      content: 'The wallet seems to be unused. Are you sure you have the right wallet configuration?',
      type: 'bubble',
    },
    {
      content: 'If you want to deposit funds, you can do so by sending Bitcoin to the following wallet address.',
      type: 'bubble',
    },
    {
      dangerouslySetInnerHTML: true,
      content: Address({ address: receiveAddress }),
      type: 'bubble',
    },
  ]
}
function getUsedButEmptyWalletMessages({ transactions }) {
  return [
    {
      content: `The wallet is currently empty but has ${transactions.length} transactions.`,
      type: 'bubble',
    },
    getTransactionsButtonBubble(),
  ]
}
function getWalletInfoBubbles({ balance, transactions, addressInfo }) {
  const confirmed = Number(balance.confirmed)
  const unconfirmed = Number(balance.untrusted_pending) + Number(balance.trusted_pending)
  const hasBalance = confirmed > 0 || unconfirmed > 0
  const hasUnconfirmedBalance = unconfirmed > 0
  const hasTransactions = transactions.length > 0
  if (!hasBalance && !hasTransactions) {
    return {
      messages: getUnfundedWalletMessages({ receiveAddress: addressInfo.address }),
      isRecoverable: false,
    }
  }
  if (!hasBalance && hasTransactions) {
    return {
      messages: getUsedButEmptyWalletMessages({ transactions }),
      isRecoverable: false,
    }
  }
  const balanceMessage = hasUnconfirmedBalance
    ? `Your wallet has a balance of ${Sats(confirmed)}. <br/>${Sats(unconfirmed)} is still unconfirmed.`
    : `Your wallet has a confirmed balance of <br/>${Sats(confirmed)}.`
  return {
    messages: [
      {
        content: 'I was able to find the following information about your wallet.',
        type: 'bubble',
      },
      {
        content: balanceMessage,
        dangerouslySetInnerHTML: true,
        type: 'bubble',
      },
      {
        content: `Your wallet was involved in ${transactions.length} transactions.`,
        type: 'bubble',
      },
      {
        content: 'You can start recovering your wallet now, or view the transactions the wallet was involved in.',
        type: 'bubble',
      },
      {
        content: [
          `<button id="begin-recovery-btn" class="btn btn-primary btn-sm">Start Recovery</button>`,
          getTransactionsButtonBubble().content,
        ].join(''),
        dangerouslySetInnerHTML: true,
        footer: /* @__PURE__ */ new Date().toLocaleString(),
        type: 'actions',
      },
    ],
    isRecoverable: true,
  }
}
const isChangeDescriptor = (descriptor) => {
  const changePattern = /\/1\/\*\)+(?:#\w+)?$/
  return changePattern.test(descriptor)
}
const populateTransactionOverview = ({ address, outbound, fee }) => {
  const overviewAmount = document.getElementById('transaction-overview-amount')
  if (overviewAmount) {
    overviewAmount.textContent = Sats(outbound)
  }
  const overviewFee = document.getElementById('transaction-overview-fee')
  if (overviewFee) {
    overviewFee.textContent = Sats(fee || '')
  }
  const overviewAddress = document.getElementById('transaction-overview-address')
  if (overviewAddress) {
    overviewAddress.textContent = address
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
const validateDescriptor = async () => {
  const { descriptors, network } = getUserInputs()
  clearStatusIndicators(DOM.inputs.receive)
  const descriptor = descriptors.receive
  if (!descriptor) {
    DOM.inputs.receive.classList.add('textarea-error')
    DOM.feedback.receiveInputValidationMessage.classList.remove('text-warning', 'text-success')
    DOM.feedback.receiveInputValidationMessage.classList.add('text-error')
    DOM.feedback.receiveInputValidationMessage.textContent = 'Wallet configuration is missing!'
    return false
  }
  try {
    const isValidDescriptor = await commands.isDescriptorForNetwork(descriptor, network)
    if (!isValidDescriptor) {
      DOM.inputs.receive.classList.add('textarea-error')
      DOM.feedback.receiveInputValidationMessage.classList.remove('text-warning', 'text-success')
      DOM.feedback.receiveInputValidationMessage.classList.add('text-error')
      DOM.feedback.receiveInputValidationMessage.textContent =
        'Your wallet configuration is for a different network. Open the network settings below to change the network!'
      return false
    }
    if (isChangeDescriptor(descriptor)) {
      DOM.inputs.receive.classList.add('textarea-warning')
      DOM.feedback.receiveInputValidationMessage.classList.remove('text-error', 'text-success')
      DOM.feedback.receiveInputValidationMessage.classList.add('text-warning')
      DOM.feedback.receiveInputValidationMessage.textContent =
        'You seem to be using a change descriptor for your wallet configuration. This may limit wallet functionality, such as showing only a partial balance instead of the full wallet balance.'
      return true
    }
    DOM.inputs.receive.classList.add('textarea-success')
    DOM.feedback.receiveInputValidationMessage.classList.remove('text-error', 'text-warning')
    DOM.feedback.receiveInputValidationMessage.classList.add('text-success')
    DOM.feedback.receiveInputValidationMessage.textContent =
      'Your wallet configuration is valid. You can fetch your wallet now.'
    return true
  } catch (e) {
    console.error(e)
    DOM.inputs.receive.classList.add('textarea-error')
    DOM.feedback.receiveInputValidationMessage.classList.remove('text-warning', 'text-success')
    DOM.feedback.receiveInputValidationMessage.classList.add('text-error')
    DOM.feedback.receiveInputValidationMessage.textContent = 'Invalid wallet configuration!'
    return false
  }
}
async function validatePsbt() {
  var _a, _b, _c
  const { psbt, network, descriptors } = getUserInputs()
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
      DOM.buttons.broadcast.classList.remove('btn-disabled', 'hidden')
      DOM.buttons.sign.classList.add('btn-disabled', 'hidden')
      ;(_a = document.getElementById('missing-signature')) == null ? void 0 : _a.classList.add('hidden')
    } else if (psbtStatus === 'PartiallySigned') {
      DOM.outputs.psbtStatus.innerHTML = `
        <span class="opacity-70">Partially Signed</span>
      `
      ;(_b = document.getElementById('missing-signature')) == null ? void 0 : _b.classList.remove('hidden')
    } else if (psbtStatus === 'Unsigned') {
      DOM.outputs.psbtStatus.innerHTML = `
        <span class="opacity-70">Unsigned</span>
      `
      ;(_c = document.getElementById('missing-signature')) == null ? void 0 : _c.classList.remove('hidden')
    }
  } catch (e) {
    handleError(e)
  }
}
async function validateAddress() {
  const { address, descriptors, network } = getUserInputs()
  clearStatusIndicators(DOM.inputs.address)
  DOM.buttons.sweep.classList.remove('is-mine')
  if (!address) {
    DOM.inputs.address.classList.remove('input-error', 'input-warning', 'input-success')
    DOM.feedback.addressInputValidationMessage.textContent = ''
    return false
  }
  try {
    const isValid = await commands.isAddress(address)
    if (!isValid) {
      DOM.inputs.address.classList.add('input-error')
      DOM.feedback.addressInputValidationMessage.classList.remove('text-warning', 'text-success')
      DOM.feedback.addressInputValidationMessage.classList.add('text-error')
      DOM.feedback.addressInputValidationMessage.textContent = 'This address is not valid.'
      return false
    }
    const isForNetwork = await commands.isAddressForNetwork(address, network)
    if (!isForNetwork) {
      DOM.inputs.address.classList.add('input-error')
      DOM.feedback.addressInputValidationMessage.classList.remove('text-warning', 'text-success')
      DOM.feedback.addressInputValidationMessage.classList.add('text-error')
      DOM.feedback.addressInputValidationMessage.textContent = 'This address is not for the selected network'
      return false
    }
    const isMine = await commands.isAddressMine(address, network, descriptors)
    if (isMine) {
      DOM.feedback.addressInputValidationMessage.classList.remove('text-error', 'text-success')
      DOM.feedback.addressInputValidationMessage.classList.add('text-warning')
      DOM.feedback.addressInputValidationMessage.textContent =
        'Warning: This address belongs to the same wallet. Please be sure you intend to send this transaction to yourself.'
      DOM.inputs.address.classList.add('input-warning')
      DOM.buttons.sweep.classList.add('is-mine')
      return false
    }
    DOM.inputs.address.classList.add('input-success')
    DOM.feedback.addressInputValidationMessage.classList.remove('text-error', 'text-warning')
    DOM.feedback.addressInputValidationMessage.classList.add('text-success')
    DOM.feedback.addressInputValidationMessage.textContent = 'This address looks good!'
    return true
  } catch (e) {
    DOM.inputs.address.classList.add('input-error')
    handleError(e)
  }
  return false
}
function createActionContainer() {
  const chatContainer = document.createElement('div')
  chatContainer.classList.add('chat', 'animate-in', 'fade-in', 'slide-in-from-bottom-2', 'px-[0.75rem]', 'grid-cols-1')
  const actions = document.createElement('div')
  actions.classList.add('px-4', 'py-4', 'border', 'bg-base-200', 'border-gray-300', 'rounded-lg', 'flex', 'gap-4')
  return { chatContainer, actions }
}
function createConversationActions({ content, footer, dangerouslySetInnerHTML = false, onAppended }) {
  try {
    const { chatContainer, actions } = createActionContainer()
    if (dangerouslySetInnerHTML) {
      if (content instanceof HTMLElement) {
        actions.appendChild(content)
      } else {
        actions.innerHTML = content
      }
      onAppended == null ? void 0 : onAppended(actions)
    } else if (typeof content === 'string') {
      actions.innerText = content
    }
    chatContainer.appendChild(actions)
    if (footer) {
      const footerContainer = document.createElement('div')
      footerContainer.classList.add('chat-footer', 'pt-1', 'opacity-70')
      footerContainer.innerText = footer
      chatContainer.appendChild(footerContainer)
    }
    return chatContainer
  } catch (error) {
    console.error(error)
    return null
  }
}
function getTransactionCreatedBubbles({ address, sent, outbound, hasUserFeeRate, feeRate }) {
  if (!hasUserFeeRate) {
    const amount = outbound || sent
    return {
      messages: [
        ...(amount
          ? [
              {
                content: `Created a transaction to send <span class="font-bold">${Sats(amount)}</span> to <br/><span class="break-all font-bold">${sanitize(address)}</span>.`,
                type: 'bubble',
                dangerouslySetInnerHTML: true,
              },
            ]
          : []),
        ...(feeRate
          ? [
              {
                content: `Applied a network fee of <span class="font-bold">${Sats(feeRate)}</span> to get that transaction confirmed swiftly.`,
                type: 'bubble',
                dangerouslySetInnerHTML: true,
              },
            ]
          : []),
        {
          type: 'bubble',
          content: 'Verify the transaction details on the right carefully before proceeding with signing.',
        },
      ],
    }
  }
  return {
    messages: [
      {
        content: 'Transaction (PSBT) created!',
        type: 'bubble',
      },
    ],
  }
}
function getDeviceName(device) {
  switch (device.type) {
    case 'jade': {
      return 'Jade'
    }
    default: {
      return device.type
    }
  }
}
function getJadeDevice({ fingerprint }) {
  return `<svg viewBox="0 0 309 138" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: auto">
<g filter="url(#filter0_d_23_53)">
<path fill-rule="evenodd" clip-rule="evenodd" d="M78.6022 1.58451C78.6022 0.865902 79.1848 0.283356 79.9034 0.283356L90.5195 0.283356C91.2381 0.283356 91.8206 0.865902 91.8206 1.58451V4.2959C91.9736 5.67144 94.0036 5.92154 94.4211 4.49356C94.8833 2.91285 97.2393 3.41363 97.0186 5.04566C96.8092 6.59402 98.9771 7.17492 99.57 5.72931C100.195 4.20558 102.486 4.94988 102.095 6.5499C101.725 8.06788 103.821 8.87221 104.561 7.49649C105.342 6.04642 107.543 7.02609 106.987 8.57658C106.935 8.72282 106.908 8.8646 106.902 9.00008C140.078 9.00008 173.254 9.00006 206.431 9.00004L294 9.00001C300.075 9.00001 305 13.9227 305 19.9978V119.002C305 125.077 300.08 130 294.005 130L14.9954 130C8.9203 130 4 125.077 4 119.002L4 19.9978C4 13.9227 8.92488 9.00001 15 9.00002C31.17 9.00004 47.3399 9.00006 63.5099 9.00006C63.5039 8.86459 63.4765 8.72282 63.4241 8.57658C62.8689 7.0261 65.0693 6.04643 65.85 7.4965C66.5907 8.87221 68.6861 8.06789 68.316 6.5499C67.9259 4.94988 70.2166 4.20558 70.8415 5.72931C71.4343 7.17492 73.6023 6.59401 73.3929 5.04566C73.1722 3.41363 75.5282 2.91284 75.9904 4.49355C76.4289 5.9932 78.6457 5.6421 78.5993 4.08034C78.5976 4.02609 78.5987 3.97335 78.6022 3.92214V1.58451Z" fill="#1D1D1D"/>
<g filter="url(#filter1_i_23_53)">
<path d="M21.4911 30.852C21.4911 27.9775 23.8213 25.6474 26.6957 25.6474L143.719 25.6474C146.594 25.6474 148.924 27.9776 148.924 30.852V109.262C148.924 112.136 146.594 114.466 143.719 114.466L26.6957 114.466C23.8213 114.466 21.4911 112.136 21.4911 109.262L21.4911 30.852Z" fill="#444444"/>
</g>
<path d="M4 9H305V130H4V9Z" fill="url(#paint0_linear_23_53)"/>
<g filter="url(#filter2_d_23_53)">
<path d="M179.758 45.8508C179.758 42.9764 182.088 40.6462 184.962 40.6462L218.148 40.6462C221.022 40.6462 223.352 42.9764 223.352 45.8509V94.1831C223.352 97.0575 221.022 99.3877 218.148 99.3877H184.962C182.088 99.3877 179.758 97.0575 179.758 94.1831L179.758 45.8508Z" fill="#2D2D2D" fill-opacity="0.8" shape-rendering="crispEdges"/>
</g>
<g filter="url(#filter3_d_23_53)">
<path fill-rule="evenodd" clip-rule="evenodd" d="M217.92 41.9876L184.734 41.9876C182.579 41.9876 180.831 43.7353 180.831 45.8911V94.2234C180.831 96.3792 182.579 98.1268 184.734 98.1268H217.92C220.076 98.1268 221.823 96.3792 221.823 94.2234V45.8911C221.823 43.7353 220.076 41.9876 217.92 41.9876ZM184.734 40.6865C181.86 40.6865 179.53 43.0167 179.53 45.8911L179.53 94.2234C179.53 97.0978 181.86 99.428 184.734 99.428H217.92C220.794 99.428 223.124 97.0978 223.124 94.2234V45.8911C223.124 43.0167 220.794 40.6865 217.92 40.6865L184.734 40.6865Z" fill="black"/>
</g>
<text x="144" y="108" fill="#ffffff" text-anchor="end" class="text-sm">${fingerprint.toUpperCase()}</text>
<circle cx="32" cy="104" r="4" fill="#90E3B1"/>
</g>
<defs>
<filter id="filter0_d_23_53" x="0" y="0.283356" width="309" height="137.717" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="4"/>
<feGaussianBlur stdDeviation="2"/>
<feComposite in2="hardAlpha" operator="out"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.05 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_23_53"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_23_53" result="shape"/>
</filter>
<filter id="filter1_i_23_53" x="21.4911" y="25.6474" width="127.433" height="88.8191" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset/>
<feGaussianBlur stdDeviation="1"/>
<feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"/>
<feBlend mode="normal" in2="shape" result="effect1_innerShadow_23_53"/>
</filter>
<filter id="filter2_d_23_53" x="175.758" y="40.6462" width="51.5947" height="66.7415" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="4"/>
<feGaussianBlur stdDeviation="2"/>
<feComposite in2="hardAlpha" operator="out"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_23_53"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_23_53" result="shape"/>
</filter>
<filter id="filter3_d_23_53" x="175.53" y="40.6865" width="51.5947" height="66.7415" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="4"/>
<feGaussianBlur stdDeviation="2"/>
<feComposite in2="hardAlpha" operator="out"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_23_53"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_23_53" result="shape"/>
</filter>
<linearGradient id="paint0_linear_23_53" x1="33.3475" y1="-0.758069" x2="209.829" y2="99.823" gradientUnits="userSpaceOnUse">
<stop stop-color="white" stop-opacity="0"/>
<stop offset="0.82" stop-color="white" stop-opacity="0.07"/>
<stop offset="1" stop-color="white" stop-opacity="0"/>
</linearGradient>
</defs>
</svg>
`
}
const createConversationImage = ({ content, footer }) => {
  const chatContainer = document.createElement('div')
  chatContainer.classList.add('chat', 'animate-in', 'fade-in', 'slide-in-from-bottom-2', 'px-[0.75rem]', 'grid-cols-1')
  const bubble = document.createElement('div')
  bubble.classList.add('chat-bubble-info', 'rounded-lg', 'w-3/4', 'max-w-[300px]', 'px-4', 'py-4')
  if (content instanceof HTMLElement) {
    bubble.appendChild(content)
  } else {
    bubble.innerHTML = content
  }
  chatContainer.appendChild(bubble)
  if (footer) {
    const footerContainer = document.createElement('div')
    footerContainer.classList.add('chat-footer', 'pt-1', 'opacity-70')
    footerContainer.innerText = footer
    chatContainer.appendChild(footerContainer)
  }
  showConversation()
  showClearMessagesButton()
  return chatContainer
}
const FEE_RATE_WARNING_RATIO = 0.9
async function getFeeRate() {
  const { feeRate, network, electrum } = getUserInputs()
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
const addSignatureToSignHistory = (device) => {
  const newSignature = document.createElement('li')
  newSignature.className = 'border rounded-md p-2 bg-success/10 border-success flex group gap-2 text-success'
  const icon = CircularTickIcon
  newSignature.innerHTML = `${icon}<div class="flex flex-col"><span class="text-success-content">${getDeviceName(device)}</span><span class="text-sm text-success-content/70">${device.fingerprint}</span></div>`
  return newSignature
}
const updateSignHistory = (device) => {
  const newSignature = addSignatureToSignHistory(device)
  const stepsList = DOM.outputs.psbtSignHistory
  const missingSignature = stepsList.querySelector('#missing-signature')
  if (missingSignature) {
    stepsList.insertBefore(newSignature, missingSignature)
  } else {
    stepsList.appendChild(newSignature)
  }
}
function require2(value, message, errorElement) {
  if (value) {
    errorElement.textContent = ''
    return
  }
  errorElement.textContent = message
  throw new Error(message)
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function broadcast() {
  const { descriptors, electrum, network, psbt } = getUserInputs()
  const isValid = await validateDescriptor()
  if (!isValid) return
  require2(psbt, 'PSBT is required', DOM.feedback.psbtInputValidationMessage)
  DOM.outputs.tempMessage.textContent = 'Please wait...'
  try {
    const userBubble = createConversationBubble({
      content: 'Broadcast the transaction to the Bitcoin network',
      isUserSpeaking: true,
    })
    addToConversation(userBubble)
    await commands.broadcast(psbt, network, descriptors, electrum)
    await sleep(500)
    showTempLoadingMessage('Broadcasting transaction...')
    await sleep(2e3)
    hideTempMessage()
    addToConversation(
      createConversationBubble({
        content: 'Transaction successfully broadcasted.',
        footer: /* @__PURE__ */ new Date().toLocaleString(),
      })
    )
    await sleep(500)
    addToConversation(
      createConversationBubble({
        content: 'Your transaction should be visible in your wallet shortly and confirmed in the next few blocks.',
      })
    )
  } catch (e) {
    handleError(e)
  }
}
async function enumerate() {
  const { network } = getUserInputs()
  DOM.outputs.tempMessage.textContent = 'Please wait... (be sure to check attached device for prompts)'
  try {
    const userBubble = createConversationBubble({
      content: 'Find my device',
      isUserSpeaking: true,
    })
    addToConversation(userBubble)
    const response = await commands.enumerate(network)
    const tempuraBubble = createConversationBubble({
      content: getDeviceMessage(response),
    })
    addToConversation(tempuraBubble)
    DOM.outputs.tempMessage.textContent = getDevicePrompt(response)
  } catch (e) {
    handleError(e)
  }
}
async function loadWallet() {
  const { descriptors, electrum, network } = getUserInputs()
  const isValid = await validateDescriptor()
  if (!isValid) return
  showTempLoadingMessage('Fetching wallet')
  try {
    const userBubble = createConversationBubble({
      content: 'Fetch my wallet.',
      isUserSpeaking: true,
    })
    addToConversation(userBubble)
    showTempLoadingMessage('Fetching wallet')
    const { balance, transactions } = await commands.wallet(network, descriptors, electrum)
    const addressInfo = await commands.address(network, descriptors, electrum)
    DOM.outputs.txBody.innerHTML = Transactions(transactions)
    hideTempMessage()
    const { messages: walletInfoBubbles, isRecoverable } = getWalletInfoBubbles({
      // balance: { immature: '0', confirmed: '0', trusted_pending: '0', untrusted_pending: '0' },
      balance,
      transactions,
      addressInfo,
    })
    if (!walletInfoBubbles || !walletInfoBubbles.length) {
      const couldNotFindWalletInfoBubble = createConversationBubble({
        content: 'I could not find any information about your wallet',
      })
      addToConversation(couldNotFindWalletInfoBubble)
      return
    }
    for (const bubble of walletInfoBubbles) {
      const tempuraItem = bubble.type === 'bubble' ? createConversationBubble(bubble) : createConversationActions(bubble)
      if (!tempuraItem) {
        continue
      }
      if (bubble.type === 'actions') {
        instrumentCopyButtons(tempuraItem)
        const showListButton = tempuraItem.querySelector('#show-transactions-btn')
        showListButton == null
          ? void 0
          : showListButton.addEventListener('click', () => {
              DOM.modals.transactions.showModal()
            })
        instrumentStartRecoveryButton(tempuraItem)
      }
      addToConversation(tempuraItem)
      await sleep(400)
    }
    if (!isRecoverable) {
      return
    }
    instrumentCopyButtons(DOM.outputs.txBody)
  } catch (e) {
    handleError(e)
  }
}
function instrumentStartRecoveryButton(parent) {
  const beginRecoveryButton = parent.querySelector('#begin-recovery-btn')
  if (!beginRecoveryButton) {
    return
  }
  beginRecoveryButton.addEventListener('click', async () => {
    const isChecked = DOM.radios.recoveryOptionsCollapse.checked
    if (isChecked) {
      return
    }
    const addDestinationAddressMessage = createConversationBubble({
      content:
        'Recovering is simple. Add an address in the input on the right. We create a recovery transaction and send the funds to that address next.',
      isUserSpeaking: false,
    })
    addToConversation(addDestinationAddressMessage)
    await sleep(1e3)
    DOM.radios.recoveryOptionsCollapse.checked = true
  })
}
function instrumentCopyButtons(parent) {
  parent.querySelectorAll('button[name=copy]').forEach((copyButton) => {
    copyButton.addEventListener('click', () => {
      writeText(copyButton.getAttribute('value') ?? '')
        .then(() => {
          const tooltip = copyButton.closest('.tooltip')
          tooltip == null ? void 0 : tooltip.setAttribute('data-tip', 'Copied')
          const copyIcon = copyButton.querySelector('#copy-icon')
          copyIcon == null ? void 0 : copyIcon.classList.add('copied')
          const checkmark = copyIcon == null ? void 0 : copyIcon.querySelector('#checkmark')
          checkmark == null ? void 0 : checkmark.classList.remove('hidden')
          setTimeout(() => {
            tooltip == null ? void 0 : tooltip.setAttribute('data-tip', 'Copy')
            checkmark == null ? void 0 : checkmark.classList.add('hidden')
            copyIcon == null ? void 0 : copyIcon.classList.remove('copied')
          }, 2e3)
        })
        .catch(() => {
          DOM.outputs.tempMessage.textContent = `Failed to copy ${copyButton.getAttribute('value')} to clipboard`
        })
    })
  })
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
  try {
    const { electrum, network } = getUserInputs()
    DOM.buttons.estimate.classList.add('is-loading')
    const feeRate = await commands.estimateFee(network, electrum, 1)
    DOM.buttons.estimate.classList.remove('is-loading')
    DOM.inputs.feeRate.value = feeRate.toString()
  } catch (e) {
    handleError(e)
  }
}
function pastePsbtFromClipboard() {
  readText()
    .then((psbt) => {
      const trimmed = psbt.trim()
      if (trimmed !== DOM.outputs.psbtTextArea.value) {
        DOM.buttons.broadcast.classList.remove('btn-disabled', 'hidden')
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
const toggleChangeInput = () => DOM.containers.change.classList.toggle('hidden', DOM.checkboxes.change.checked)
const toggleElectrumInput = () => DOM.containers.electrum.classList.toggle('hidden', DOM.checkboxes.electrum.checked)
const toggleFeeRateInput = () => DOM.containers.feeRate.classList.toggle('hidden', DOM.checkboxes.feeRate.checked)
const toggleNetworkInput = () => DOM.containers.network.classList.toggle('hidden', DOM.checkboxes.network.checked)
async function sign({ retryCount = 0 } = {}) {
  const { psbt, descriptors, network } = getUserInputs()
  require2(psbt, 'PSBT is required', DOM.feedback.psbtInputValidationMessage)
  try {
    showTempLoadingMessage('Looking for your device…')
    await sleep(400)
    const enumeration = await commands.enumerate(network)
    const device = getDevice(enumeration)
    hideTempMessage()
    const deviceInstructionBubbles = [
      ...(device.type === 'jade'
        ? [
            {
              content: getJadeDevice({ fingerprint: device.fingerprint ?? '' }),
              type: 'image',
            },
            {
              content: `Found your ${getDeviceName(device)}. Verify the transaction on the screen, it may take a few seconds to appear.`,
              footer: /* @__PURE__ */ new Date().toLocaleString(),
              type: 'bubble',
            },
          ]
        : [
            {
              content: `Found a ${device.type} with fingerprint ${device.fingerprint}.`,
              type: 'bubble',
            },
            {
              content: `Follow the instructions on your ${getDeviceName(device)}. It may take a few seconds for them to appear.`,
              type: 'bubble',
            },
          ]),
    ]
    for (const { type, ...bubble } of deviceInstructionBubbles) {
      const item = type === 'image' ? createConversationImage(bubble) : createConversationBubble(bubble)
      addToConversation(item)
      await sleep(400)
    }
    await sleep(9e3)
    showTempLoadingMessage('Waiting for you to sign the transaction')
    const response = await commands.sign(psbt, network, device.type)
    hideTempMessage()
    const { psbt: responsePsbt, message, signed } = getSignResultAndPsbt(response)
    DOM.outputs.psbtTextArea.value = responsePsbt
    const tempuraBubble = createConversationBubble({
      content: message,
      //footer: new Date().toLocaleString(),
      dangerouslySetInnerHTML: true,
    })
    addToConversation(tempuraBubble)
    validatePsbt()
    if (signed) {
      updateSignHistory(device)
    }
    const psbtStatus = await commands.psbtStatus(responsePsbt, network, descriptors)
    await sleep(600)
    addToConversation(
      createConversationBubble({
        content: getPsbtStatusMessage(psbtStatus),
        footer: /* @__PURE__ */ new Date().toLocaleString(),
      })
    )
    if (psbtStatus === 'PartiallySigned') {
      await sleep(4e3)
      addToConversation(
        createConversationBubble({
          content: 'Connect another device to continue signing the transaction.',
        })
      )
      const actions = createConversationActions({
        content: '<button class="btn btn-primary btn-sm">Continue signing with another device</button>',
        dangerouslySetInnerHTML: true,
        onAppended: (parent) => {
          var _a
          ;(_a = parent.querySelector('button')) == null
            ? void 0
            : _a.addEventListener('click', () => {
                sign()
              })
        },
      })
      if (actions) {
        addToConversation(actions)
      }
    }
  } catch (e) {
    if (e instanceof Error) {
      const tryAgainActions = createConversationActions({
        content: `<button class="btn btn-outline btn-sm" id="get-device-and-sign-again-btn">Try again</button>`,
        dangerouslySetInnerHTML: true,
        onAppended: (parent) => {
          var _a
          ;(_a = parent.querySelector('#get-device-and-sign-again-btn')) == null
            ? void 0
            : _a.addEventListener('click', () => {
                sign({ retryCount: retryCount + 1 })
              })
        },
      })
      if (e.message.toLowerCase() === 'no devices found') {
        hideTempMessage()
        addToConversation(
          createConversationBubble({
            content:
              retryCount > 3
                ? 'If you have trouble connecting to your device please try a different USB port or cable.'
                : 'No devices found. Please make sure your device is plugged in and unlocked (PIN entered).',
            footer: /* @__PURE__ */ new Date().toLocaleString(),
          }),
          {
            shouldScrollToLastMessage: !tryAgainActions,
          }
        )
      }
      if (e.message.toLowerCase().includes('failed to extract psbt')) {
        hideTempMessage()
        addToConversation(
          createConversationBubble({
            content: `Looks like you refused to sign this transaction. If this was a mistake, you can try again.`,
          }),
          {
            shouldScrollToLastMessage: !tryAgainActions,
          }
        )
      }
      await sleep(400)
      if (tryAgainActions) {
        addToConversation(tryAgainActions, {
          shouldScrollToLastMessage: true,
        })
      }
      return
    }
    handleError(e)
  }
}
async function sweep() {
  const inputs = getUserInputs()
  const { address, descriptors, electrum, network } = inputs
  const isValid = await validateDescriptor()
  if (!isValid) return
  if (!address) {
    DOM.inputs.address.classList.add('input-error')
  } else {
    DOM.inputs.address.classList.remove('input-error')
  }
  require2(address, 'A destination address is required', DOM.feedback.addressInputValidationMessage)
  const { feeRate: userFeeRate } = getUserInputs()
  const feeRate = await getFeeRate()
  if (feeRate.failed || feeRate.value === null) {
    DOM.outputs.tempMessage.textContent =
      'Unable to automatically estimate a fee for this network. Please enter a fee rate manually.'
    return
  }
  DOM.outputs.tempMessage.textContent = 'Please wait...'
  try {
    const createTransactionMessage = !userFeeRate
      ? `Create a transaction to send all wallet funds to <br/><span class="break-all font-bold">${sanitize(address)}</span>`
      : `Create a transaction to send all wallet funds to <span class="break-all font-bold">${sanitize(address)}</span> with a network fee rate of ${feeRate.value} sats/vB.`
    const userBubble = createConversationBubble({
      content: createTransactionMessage,
      //content: `Create a transaction to send all wallet funds to <span class="break-all font-bold">${sanitize(address)}</span> with a network fee rate of ${feeRate.value} sats/vB.`,
      //content: `Create a transaction (PSBT) sending all wallet funds to <span class="break-all font-bold">${sanitize(address)}</span> with a network fee rate of ${feeRate.value} sats/vB.`,
      isUserSpeaking: true,
      dangerouslySetInnerHTML: true,
    })
    addToConversation(userBubble)
    const psbtDetails = await commands.sweep(address, feeRate.value, network, descriptors, electrum)
    const { psbt, outbound, sent, fee } = psbtDetails
    await sleep(1e3)
    clearStatusIndicators(DOM.outputs.psbtTextArea)
    const { messages: replies } = getTransactionCreatedBubbles({
      sent,
      address,
      hasUserFeeRate: !!userFeeRate,
      feeRate: fee,
    })
    for (const reply of replies) {
      const tempuraBubble = createConversationBubble(reply)
      addToConversation(tempuraBubble)
      await sleep(400)
    }
    DOM.outputs.transactionOverview.classList.remove('hidden')
    populateTransactionOverview({ address: DOM.inputs.address.value, outbound, fee })
    DOM.outputs.psbtTextArea.value = psbt
    validatePsbt()
    DOM.outputs.transactionOverview.scrollIntoView({ behavior: 'smooth' })
    DOM.outputs.tempMessage.textContent = 'Sign next?'
    if (feeRate.warning) {
      const warningBubble = createConversationBubble({
        content: feeRate.warning,
      })
      addToConversation(warningBubble)
    }
    DOM.radios.sendTransactionCollapse.checked = true
  } catch (e) {
    handleError(e)
  }
}
window.addEventListener('DOMContentLoaded', () => {
  initializeDOM()
  DOM.buttons.broadcast.addEventListener('click', (e) => {
    e.preventDefault()
    broadcast()
  })
  DOM.buttons.copyPsbt.addEventListener('click', (e) => {
    e.preventDefault()
    copyPsbtToClipboard()
  })
  DOM.buttons.enumerate.addEventListener('click', (e) => {
    e.preventDefault()
    enumerate()
  })
  DOM.buttons.advancedMode.addEventListener('click', (e) => {
    e.preventDefault()
    document.documentElement.classList.toggle('advanced-mode')
  })
  DOM.buttons.estimate.addEventListener('click', (e) => {
    e.preventDefault()
    estimateFee()
  })
  DOM.buttons.load.addEventListener('click', (e) => {
    e.preventDefault()
    loadWallet()
  })
  DOM.buttons.modals.autoChange.addEventListener('click', (e) => {
    e.preventDefault()
    DOM.modals.autoChange.showModal()
  })
  DOM.buttons.modals.autoElectrum.addEventListener('click', (e) => {
    e.preventDefault()
    DOM.modals.autoElectrum.showModal()
  })
  DOM.buttons.modals.electrumServer.addEventListener('click', (e) => {
    e.preventDefault()
    DOM.modals.electrumServer.showModal()
  })
  DOM.buttons.modals.feeRate.addEventListener('click', (e) => {
    e.preventDefault()
    DOM.modals.feeRate.showModal()
  })
  DOM.buttons.modals.network.addEventListener('click', (e) => {
    e.preventDefault()
    DOM.modals.network.showModal()
  })
  DOM.buttons.modals.walletConfig.addEventListener('click', (e) => {
    e.preventDefault()
    DOM.modals.walletConfig.showModal()
  })
  DOM.buttons.pastePsbt.addEventListener('click', (e) => {
    e.preventDefault()
    pastePsbtFromClipboard()
  })
  DOM.buttons.sign.addEventListener('click', async (e) => {
    e.preventDefault()
    const userBubble = createConversationBubble({
      content: 'Sign this transaction (PSBT)',
      isUserSpeaking: true,
    })
    addToConversation(userBubble)
    await sleep(400)
    addToConversation(
      createConversationBubble({
        content:
          'To sign the transaction, we need to find your device. Make sure it is plugged in and unlocked (PIN entered).',
        isUserSpeaking: false,
      })
    )
    await sleep(2e3)
    sign()
  })
  DOM.buttons.sweep.addEventListener('click', (e) => {
    e.preventDefault()
    sweep()
  })
  DOM.checkboxes.change.addEventListener('click', toggleChangeInput)
  DOM.checkboxes.electrum.addEventListener('click', toggleElectrumInput)
  DOM.checkboxes.feeRate.addEventListener('click', toggleFeeRateInput)
  DOM.checkboxes.network.addEventListener('click', toggleNetworkInput)
  DOM.inputs.address.addEventListener('input', validateAddress)
  DOM.inputs.networkRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      DOM.inputs.address.value = ''
      clearStatusIndicators(DOM.inputs.address)
      validateDescriptor()
    })
  })
  DOM.inputs.receive.addEventListener('blur', () => {
    validateDescriptor()
    DOM.outputs.conversation.querySelectorAll('div.wallet-info').forEach((e) => {
      e.innerHTML = 'Outdated'
    })
  })
  DOM.inputs.receive.addEventListener('input', () => {
    DOM.inputs.receive.value = DOM.inputs.receive.value.replace(/\r?\n|\r/g, '').trim()
    validateDescriptor()
    DOM.outputs.conversation.querySelectorAll('div.wallet-info').forEach((e) => {
      e.innerHTML = 'Outdated'
    })
  })
  DOM.outputs.psbtTextArea.addEventListener('input', () => {
    DOM.buttons.broadcast.classList.remove('btn-disabled', 'hidden')
    DOM.outputs.psbtSignHistory.innerHTML = ''
    validatePsbt()
  })
  DOM.links.about.addEventListener('click', async (e) => {
    e.preventDefault()
    await commands.createWindow('about', 'about.html', 'About Swan Vault Recovery Assistant', 800, 950)
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
  DOM.buttons.clearMessages.addEventListener('click', () => {
    DOM.outputs.conversation.innerHTML = ''
    DOM.outputs.tempMessage.textContent = 'All messages cleared 🫡'
    DOM.buttons.clearMessages.classList.add('hidden')
  })
})
