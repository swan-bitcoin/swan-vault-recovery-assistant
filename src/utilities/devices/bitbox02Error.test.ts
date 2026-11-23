import { describe, it, expect } from 'vitest'
import { getBitbox02ErrorText, parseBitbox02Error } from './bitbox02Error'

describe('parseBitbox02Error()', () => {
  it('should return the code and message of a BitBox02 error object', () => {
    expect(parseBitbox02Error({ error_type: 'Bitbox02Error(user-abort)', message: 'You cancelled.' })).toStrictEqual({
      code: 'user-abort',
      message: 'You cancelled.',
    })
  })

  it('should return null for other SVRA errors', () => {
    expect(parseBitbox02Error({ error_type: 'PsbtError', message: 'bad' })).toBeNull()
  })

  it('should return null when the message is missing or empty', () => {
    expect(parseBitbox02Error({ error_type: 'Bitbox02Error(other)' })).toBeNull()
    expect(parseBitbox02Error({ error_type: 'Bitbox02Error(other)', message: '' })).toBeNull()
  })

  it('should return null when the code is empty', () => {
    expect(parseBitbox02Error({ error_type: 'Bitbox02Error()', message: 'x' })).toBeNull()
  })

  it.each([null, undefined, 'Bitbox02Error(other)', 42, new Error('Bitbox02Error(other)'), {}])(
    'should return null for %j',
    (value) => {
      expect(parseBitbox02Error(value)).toBeNull()
    }
  )
})

describe('getBitbox02ErrorText()', () => {
  it('should keep the tone of the refused-to-sign message for user-abort', () => {
    expect(getBitbox02ErrorText({ code: 'user-abort', message: 'x' })).toMatch(/^Looks like you refused to sign/)
  })

  it('should say the pairing code was rejected for pairing-rejected', () => {
    expect(getBitbox02ErrorText({ code: 'pairing-rejected', message: 'x' })).toMatch(
      /^Looks like you rejected the pairing code/
    )
  })

  it('should show the backend message for every other code', () => {
    expect(getBitbox02ErrorText({ code: 'firmware-too-old', message: 'Update the firmware.' })).toBe('Update the firmware.')
  })
})
