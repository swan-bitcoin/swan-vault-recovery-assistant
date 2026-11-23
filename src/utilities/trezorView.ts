import { commands, type TrezorProgress } from '../bindings'
import { addToConversation } from './addToConversation'
import { createConversationActions } from './createConversationActions'
import { createConversationBubble } from './createConversationBubble'
import { showTempLoadingMessage } from './tempMessage'
import {
  createPairingCodeEntry,
  getTrezorStepMessage,
  isPairingCodeComplete,
  normalizePairingCode,
  PAIRING_CANCELLED_MESSAGE,
  PAIRING_CODE_LENGTH,
  PAIRING_SUBMITTED_MESSAGE,
  type PairingCodeEntry,
} from './devices'

// Tailwind reads every word of the source as a possible class name. The name of this method, and the word for a list of
// choices, each match a daisyUI class that adds unused rules to the bundle. So the method name is built at run time, and
// no comment here uses either word. The attribute of a similar name does not work for this input: the page ignores it
// while the Sign button holds the keyboard, and on every run after the first.
const TAKE_KEYBOARD = ['fo', 'cus'].join('')

// the element must be in the page before it can take the keyboard
const takeKeyboard = (element: HTMLElement) =>
  (element as unknown as Record<string, (options: { preventScroll: boolean }) => void>)[TAKE_KEYBOARD]({
    preventScroll: true,
  })

// The conversation side of a Safe 7 sign run: a message per step, and the input for the pairing code.
export function createTrezorView() {
  let pairing: PairingCodeEntry | null = null

  return {
    show(update: TrezorProgress) {
      const { loading, bubble } = getTrezorStepMessage(update)

      if (bubble) addToConversation(createConversationBubble({ content: bubble }))
      showTempLoadingMessage(loading)

      if (update.step === 'enter-pairing-code') pairing = showPairingCodeEntry()
    },
    // the sign command has settled, so a code that is still waiting can no longer be used
    end() {
      pairing?.end()
    },
  }
}

function showPairingCodeEntry() {
  const input = document.createElement('input')
  input.className = 'input input-bordered input-secondary w-40 font-mono tracking-widest'
  input.type = 'text'
  input.inputMode = 'numeric'
  input.autocomplete = 'off'
  input.spellcheck = false
  input.placeholder = `${PAIRING_CODE_LENGTH} digits`
  input.setAttribute('aria-label', `The ${PAIRING_CODE_LENGTH}-digit code that your Trezor shows`)

  const continueButton = document.createElement('button')
  continueButton.type = 'button'
  continueButton.className = 'btn btn-primary btn-sm'
  continueButton.textContent = 'Continue'
  // The app marks a button that cannot be used with the btn-disabled class, as validate.ts does. The native
  // attribute with that word would make Tailwind add unused daisyUI rules to the bundle, because it scans this file.
  continueButton.classList.add('btn-disabled')

  const cancelButton = document.createElement('button')
  cancelButton.type = 'button'
  cancelButton.className = 'btn btn-outline btn-sm'
  cancelButton.textContent = 'Cancel'

  const controls = document.createElement('div')
  controls.className = 'flex flex-wrap items-center gap-2'
  controls.append(input, continueButton, cancelButton)

  const entry = createPairingCodeEntry(
    { submit: (code) => commands.submitTrezorPairingCode(code), cancel: () => commands.cancelTrezorPairing() },
    {
      onClosed: (reason) => {
        // the code must not stay in the conversation
        input.value = ''
        input.readOnly = true
        input.classList.add('opacity-70')
        continueButton.classList.add('btn-disabled')
        cancelButton.classList.add('btn-disabled')
        // the class stops the mouse only; inert stops the keyboard too
        controls.inert = true

        if (reason === 'submitted') showTempLoadingMessage(PAIRING_SUBMITTED_MESSAGE)
        if (reason === 'cancelled') showTempLoadingMessage(PAIRING_CANCELLED_MESSAGE)
      },
      onRefused: (message) => addToConversation(createConversationBubble({ content: message })),
    }
  )

  input.addEventListener('input', () => {
    input.value = normalizePairingCode(input.value)
    continueButton.classList.toggle('btn-disabled', !entry.isOpen() || !isPairingCodeComplete(input.value))
  })
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return

    e.preventDefault()
    entry.submit(input.value)
  })
  continueButton.addEventListener('click', () => entry.submit(input.value))
  cancelButton.addEventListener('click', () => entry.cancel())

  const actions = createConversationActions({ content: controls, dangerouslySetInnerHTML: true })
  if (actions) {
    addToConversation(actions)
    takeKeyboard(input)
  } else {
    // without the input the session would wait for a code that nobody can type
    entry.cancel()
  }

  return entry
}
