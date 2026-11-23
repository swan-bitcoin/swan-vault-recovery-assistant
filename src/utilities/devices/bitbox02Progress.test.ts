import { describe, it, expect } from 'vitest'
import { getBitbox02StepMessage } from './bitbox02Progress'

describe('getBitbox02StepMessage()', () => {
  it('should show only a loading message while connecting', () => {
    expect(getBitbox02StepMessage({ step: 'connecting' })).toStrictEqual({ loading: 'Connecting to your BitBox02…' })
  })

  it('should tell the user to enter the password', () => {
    expect(getBitbox02StepMessage({ step: 'unlock' }).bubble).toBe('Enter your password on the BitBox02.')
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

  it('should explain the registration', () => {
    const { bubble } = getBitbox02StepMessage({ step: 'register' })
    expect(bubble).toContain('does not know this wallet yet')
    expect(bubble).toContain('normal after a reset')
    expect(bubble).toContain('swan_vault')
    expect(bubble).toContain('recovery kit')
  })

  it('should tell the user to check the address and the amount when signing', () => {
    expect(getBitbox02StepMessage({ step: 'sign' }).bubble).toBe(
      'Check the address and the amount on your BitBox02, then confirm.'
    )
  })

  it('should not give a code to any step but the pairing step', () => {
    for (const step of ['connecting', 'unlock', 'checking-registration', 'register', 'sign'] as const) {
      expect(getBitbox02StepMessage({ step })).not.toHaveProperty('code')
    }
  })
})
