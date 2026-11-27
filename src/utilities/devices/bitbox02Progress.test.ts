import { describe, it, expect } from 'vitest'
import { getBitbox02StepMessage } from './bitbox02Progress'

describe('getBitbox02StepMessage()', () => {
  it('should show only a loading message while connecting', () => {
    const message = getBitbox02StepMessage({ step: 'connecting' })
    expect(message.loading).toContain('Connecting')
    expect(message).not.toHaveProperty('bubble')
    expect(message).not.toHaveProperty('code')
  })

  it('should tell the user about the password, and how to stop', () => {
    const { bubble, loading } = getBitbox02StepMessage({ step: 'unlock' })
    expect(bubble).toContain('password')
    expect(bubble).toContain('unplug')
    expect(loading).toBeTruthy()
  })

  it('should return the pairing code unchanged, with its line breaks, and not put it in the bubble', () => {
    const code = 'AAAA BBBB\nCCCC DDDD'
    const message = getBitbox02StepMessage({ step: 'confirm-pairing', code })
    expect(message.code).toBe(code)
    expect(message.bubble).toBeTruthy()
    expect(message.bubble).not.toContain('AAAA')
  })

  it('should tell the user what to do when the pairing codes differ', () => {
    const { bubble } = getBitbox02StepMessage({ step: 'confirm-pairing', code: 'AAAA' })
    expect(bubble).toContain('do not confirm')
    expect(bubble).toContain('Unplug')
  })

  it('should show only a loading message while checking the registration', () => {
    const message = getBitbox02StepMessage({ step: 'checking-registration' })
    expect(message.loading).toContain('vault')
    expect(message).not.toHaveProperty('bubble')
    expect(message).not.toHaveProperty('code')
  })

  it('should explain the registration under the default name, and when to stop', () => {
    const { bubble } = getBitbox02StepMessage({ step: 'register', name: 'swan_vault' })
    expect(bubble).toContain('does not know this vault yet')
    expect(bubble).toContain('Swan Vault Recovery Sheet')
    expect(bubble).toContain('stop')
    expect(bubble).not.toContain('different wallet')
  })

  it('should say that swan_vault is taken when the backend sends another name', () => {
    const { bubble, loading } = getBitbox02StepMessage({ step: 'register', name: 'swan_vault_1a2b3c4d' })
    expect(bubble).toContain('different wallet named swan_vault')
    expect(bubble).toContain('another Swan vault')
    expect(bubble).toContain('stop')
    expect(bubble).toContain('Swan Vault Recovery Sheet')
    expect(bubble).toContain('swan_vault_1a2b3c4d')
    expect(loading).toBeTruthy()
  })

  it('should return the wallet name as text, without changing it', () => {
    const name = 'swan_vault_<b>x</b>'
    expect(getBitbox02StepMessage({ step: 'register', name }).bubble).toContain(name)
  })

  it('should tell the user to check the address and the amount when signing', () => {
    const { bubble } = getBitbox02StepMessage({ step: 'sign' })
    expect(bubble).toContain('address')
    expect(bubble).toContain('amount')
  })

  it('should not give a code to any step but the pairing step', () => {
    for (const update of [
      { step: 'connecting' },
      { step: 'unlock' },
      { step: 'checking-registration' },
      { step: 'register', name: 'swan_vault' },
      { step: 'sign' },
    ] as const) {
      expect(getBitbox02StepMessage(update)).not.toHaveProperty('code')
    }
  })

  it('should call the BitBox02 by that name and never say PSBT or descriptor', () => {
    for (const update of [
      { step: 'connecting' },
      { step: 'unlock' },
      { step: 'confirm-pairing', code: 'AAAA' },
      { step: 'checking-registration' },
      { step: 'register', name: 'swan_vault' },
      { step: 'register', name: 'swan_vault_1a2b3c4d' },
      { step: 'sign' },
    ] as const) {
      const { loading, bubble } = getBitbox02StepMessage(update)
      for (const text of [loading, bubble ?? '']) {
        expect(text).not.toMatch(/PSBT|descriptor/i)
      }
    }
  })
})
