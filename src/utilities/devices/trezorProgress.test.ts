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

  it('should ask the user to check the name before allowing the connection', () => {
    const { bubble } = getTrezorStepMessage({ step: 'confirm-connection' })
    expect(bubble).toContain('Swan Vault Recovery Assistant')
    expect(bubble).toContain('Check the name on the Trezor')
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

  it('should explain why the passphrase is asked for', () => {
    const { bubble } = getTrezorStepMessage({ step: 'passphrase' })
    expect(bubble).toContain('passphrase protection')
    expect(bubble).toContain('standard wallet holds no key of this vault')
    expect(bubble).toContain('Enter your passphrase on the Trezor')
  })

  it('should warn about the multisig notice and tell the user what to check when signing', () => {
    const { bubble } = getTrezorStepMessage({ step: 'sign' })
    expect(bubble).toContain('multisig')
    expect(bubble).toContain('address and the amount')
    expect(bubble).toContain('does not know your vault')
    expect(bubble).toContain('whatever keys SVRA sends')
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
