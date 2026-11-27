import { describe, it, expect } from 'vitest'
import type { TrezorProgress } from '../../bindings'
import { getTrezorStepMessage } from './trezorProgress'

const STEPS: TrezorProgress[] = [
  { step: 'connecting' },
  { step: 'unlock' },
  { step: 'confirm-connection' },
  { step: 'enter-pairing-code' },
  { step: 'checking-key' },
  { step: 'passphrase' },
  { step: 'sign' },
]

describe('getTrezorStepMessage()', () => {
  it('should give every step a status bar text', () => {
    for (const update of STEPS) {
      expect(getTrezorStepMessage(update).loading).toBeTruthy()
    }
  })

  it('should show only a status bar text while connecting', () => {
    const message = getTrezorStepMessage({ step: 'connecting' })
    expect(message.loading).toBe('Connecting to your Trezor…')
    expect(message).not.toHaveProperty('bubble')
  })

  it('should tell the user to enter the PIN on the device', () => {
    const { bubble } = getTrezorStepMessage({ step: 'unlock' })
    expect(bubble).toContain('Unlock your Trezor')
    expect(bubble).toContain('PIN')
  })

  it('should give the pairing question in English, as an example of what the Trezor shows', () => {
    const { bubble } = getTrezorStepMessage({ step: 'confirm-connection' })
    expect(bubble).toContain(
      'In English, it asks: "Allow Swan Vault Recovery Assistant on this computer to pair with this Trezor?"'
    )
    expect(bubble).toContain('Confirm on the Trezor')
  })

  it('should ask for the 6-digit code, say why, and say that SVRA asks on every run', () => {
    const { bubble } = getTrezorStepMessage({ step: 'enter-pairing-code' })
    expect(bubble).toContain('6-digit code')
    expect(bubble).toContain('Type it here')
    expect(bubble).toContain('nothing sits in between')
    expect(bubble).toContain('every run')
    expect(bubble).toContain('stores nothing')
  })

  it('should show only a status bar text while checking the key', () => {
    const message = getTrezorStepMessage({ step: 'checking-key' })
    expect(message.loading).toContain('key of this vault')
    expect(message).not.toHaveProperty('bubble')
  })

  it('should ask for the passphrase without saying which wallet was checked and without advice about it', () => {
    const { bubble } = getTrezorStepMessage({ step: 'passphrase' })
    expect(bubble).toContain('Your Trezor asks for your passphrase. Enter it on the Trezor.')
    expect(bubble).toContain('standard wallet or in a passphrase wallet')
    // an empty passphrase helps only a Trezor that always asks, and the bubble cannot tell which one this is
    expect(bubble).not.toMatch(/empty/i)
    // the device can ask before SVRA has checked the standard wallet
    expect(bubble).not.toContain('holds no key')
  })

  it('should tell the user what the Safe 7 shows when it signs, and not promise a multisig warning or the keys', () => {
    const { bubble } = getTrezorStepMessage({ step: 'sign' })
    expect(bubble).toContain('does not know your vault and does not show its keys')
    expect(bubble).toContain('every output as a recipient, with its address and its amount')
    expect(bubble).toContain('Next it shows a lock-time screen')
    expect(bubble).toContain('Last it shows the total with the fee')
    expect(bubble).toContain('An output that returns to your vault is shown too')
    expect(bubble).toContain('hold the "Hold to sign" button')
    // the order that the Safe 7 shows: outputs, then the lock time, then the total
    expect(bubble.indexOf('every output as a recipient')).toBeLessThan(bubble.indexOf('lock-time screen'))
    expect(bubble.indexOf('lock-time screen')).toBeLessThan(bubble.indexOf('the total with the fee'))
    expect(bubble).not.toMatch(/warn|multisig|whatever keys|change/i)
  })

  it('should tell the user to check every address and amount, and not to confirm one that is unexpected', () => {
    const { bubble } = getTrezorStepMessage({ step: 'sign' })
    expect(bubble).toContain('Check every address and every amount')
    expect(bubble).toContain('If the Trezor shows an address that you do not expect, do not confirm')
  })

  it('should say how to stop at every step that waits for the user', () => {
    for (const step of ['unlock', 'confirm-connection', 'passphrase', 'sign'] as const) {
      expect(getTrezorStepMessage({ step }).bubble).toContain('unplug the Trezor')
    }
    const { bubble } = getTrezorStepMessage({ step: 'enter-pairing-code' })
    expect(bubble).toContain('Cancel')
    expect(bubble).toContain('unplug the Trezor')
  })

  it('should give a bubble to every step where the user must act, and to no other step', () => {
    const withBubble = STEPS.filter((update) => getTrezorStepMessage(update).bubble).map((update) => update.step)
    expect(withBubble).toStrictEqual(['unlock', 'confirm-connection', 'enter-pairing-code', 'passphrase', 'sign'])
  })

  it('should call the device a Trezor and never say PSBT or descriptor', () => {
    for (const update of STEPS) {
      const { loading, bubble } = getTrezorStepMessage(update)
      const text = `${loading} ${bubble ?? ''}`
      expect(text).toContain('Trezor')
      expect(text).not.toMatch(/PSBT|descriptor/i)
    }
  })
})
