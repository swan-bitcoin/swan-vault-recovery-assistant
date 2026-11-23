import { describe, it, expect } from 'vitest'
import { getBitbox02StepMessage } from './bitbox02Progress'

describe('getBitbox02StepMessage()', () => {
  it('should show only a loading message while connecting', () => {
    expect(getBitbox02StepMessage({ step: 'connecting' })).toStrictEqual({ loading: 'Connecting to your BitBox02…' })
  })

  it('should tell the user to enter the password', () => {
    expect(getBitbox02StepMessage({ step: 'unlock' }).bubble).toBe(
      'Unlock your BitBox02. Enter your password on the device if it asks.'
    )
  })

  it('should return the pairing code unchanged, with its line breaks', () => {
    const code = 'AAAA BBBB\nCCCC DDDD'
    const message = getBitbox02StepMessage({ step: 'confirm-pairing', code })
    expect(message.code).toBe(code)
    expect(message.bubble).toMatch(/same as the code on your BitBox02/)
    expect(message.bubble).not.toContain('AAAA')
  })

  it('should show only a loading message while checking the registration', () => {
    expect(getBitbox02StepMessage({ step: 'checking-registration' })).toStrictEqual({
      loading: 'Checking that your BitBox02 knows this wallet…',
    })
  })

  it('should explain the registration under the default name', () => {
    const { bubble } = getBitbox02StepMessage({ step: 'register', name: 'swan_vault' })
    expect(bubble).toContain('does not know this wallet yet')
    expect(bubble).toContain('normal after a reset')
    expect(bubble).toContain('wallet named swan_vault')
    expect(bubble).toContain('recovery kit')
    expect(bubble).not.toContain('already used')
  })

  it('should say that swan_vault is taken when the backend sends another name', () => {
    const { bubble, loading } = getBitbox02StepMessage({ step: 'register', name: 'swan_vault_1a2b3c4d' })
    expect(bubble).toContain('The name swan_vault is already used for another wallet on this BitBox02.')
    expect(bubble).toContain('registers this wallet as swan_vault_1a2b3c4d')
    expect(bubble).toContain('Compare each key with your recovery kit again, then confirm on the device.')
    expect(loading).toBe('Waiting for your BitBox02…')
  })

  it('should return the wallet name as text, without changing it', () => {
    const name = 'swan_vault_<b>x</b>'
    expect(getBitbox02StepMessage({ step: 'register', name }).bubble).toContain(name)
  })

  it('should tell the user to check the address and the amount when signing', () => {
    expect(getBitbox02StepMessage({ step: 'sign' }).bubble).toBe(
      'Check the address and the amount on your BitBox02, then confirm.'
    )
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
})
