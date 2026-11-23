import { parseTrezorError } from './trezorError'

export const PAIRING_CODE_LENGTH = 6

export const PAIRING_SUBMITTED_MESSAGE = 'Checking the code with your Trezor…'
export const PAIRING_CANCELLED_MESSAGE = 'Cancelling…'
const PAIRING_REFUSED_MESSAGE = 'SVRA could not send this to your Trezor. Unplug the Trezor, then try again.'

// Digits only and at most six, so that a pasted "123 456" or "123456\n" works.
export const normalizePairingCode = (raw: string) => raw.replace(/\D/g, '').slice(0, PAIRING_CODE_LENGTH)

export const isPairingCodeComplete = (code: string) => new RegExp(`^\\d{${PAIRING_CODE_LENGTH}}$`).test(code)

export type PairingCodeEntry = {
  submit: (raw: string) => Promise<void>
  cancel: () => Promise<void>
  // the sign command has settled; the entry takes no more input
  end: () => void
  isOpen: () => boolean
}

type Backend = {
  submit: (code: string) => Promise<unknown>
  cancel: () => Promise<unknown>
}

type Hooks = {
  // the view disables its controls and removes the typed code
  onClosed: (reason: 'submitted' | 'cancelled' | 'ended') => void
  // the backend refused the command. This is rare: it means no session waits for a code.
  onRefused: (message: string) => void
}

// The code is a secret while the pairing lasts, so this module never logs it and keeps it only for the call.
export function createPairingCodeEntry(backend: Backend, hooks: Hooks): PairingCodeEntry {
  let isOpen = true
  let hasEnded = false

  // one use per entry; the controls close before the backend answers, so a double click cannot send twice
  const use = async (reason: 'submitted' | 'cancelled', send: () => Promise<unknown>) => {
    if (!isOpen) return

    isOpen = false
    hooks.onClosed(reason)
    try {
      await send()
    } catch (e) {
      // when the session has ended, its own error is already on screen
      if (!hasEnded) hooks.onRefused(parseTrezorError(e)?.message ?? PAIRING_REFUSED_MESSAGE)
    }
  }

  return {
    submit: async (raw) => {
      const code = normalizePairingCode(raw)
      if (!isOpen || !isPairingCodeComplete(code)) return

      await use('submitted', () => backend.submit(code))
    },
    cancel: () => use('cancelled', () => backend.cancel()),
    end: () => {
      hasEnded = true
      if (!isOpen) return

      isOpen = false
      hooks.onClosed('ended')
    },
    isOpen: () => isOpen,
  }
}
