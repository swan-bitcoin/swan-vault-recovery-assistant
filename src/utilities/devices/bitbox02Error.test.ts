import { describe, it, expect } from 'vitest'
import { parseBitbox02Error } from './bitbox02Error'

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

  it('should return the code and message of the busy error', () => {
    expect(parseBitbox02Error({ error_type: 'Bitbox02Error(busy)', message: 'A session is open.' })).toStrictEqual({
      code: 'busy',
      message: 'A session is open.',
    })
  })

  it.each([null, undefined, 'Bitbox02Error(other)', 42, new Error('Bitbox02Error(other)'), {}])(
    'should return null for %j',
    (value) => {
      expect(parseBitbox02Error(value)).toBeNull()
    }
  )
})
