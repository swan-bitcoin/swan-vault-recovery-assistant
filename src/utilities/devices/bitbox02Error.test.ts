import { describe, it, expect } from 'vitest'
import { parseBitbox02Error } from './bitbox02Error'

describe('parseBitbox02Error()', () => {
  it('should return the message of a BitBox02 error object', () => {
    expect(parseBitbox02Error({ error_type: 'Bitbox02Error', message: 'You cancelled.' })).toStrictEqual({
      message: 'You cancelled.',
    })
  })

  it('should return null for other SVRA errors', () => {
    expect(parseBitbox02Error({ error_type: 'PsbtError', message: 'bad' })).toBeNull()
  })

  it('should return null when the message is missing or empty', () => {
    expect(parseBitbox02Error({ error_type: 'Bitbox02Error' })).toBeNull()
    expect(parseBitbox02Error({ error_type: 'Bitbox02Error', message: '' })).toBeNull()
  })

  it.each(['Bitbox02Error(busy)', 'Bitbox02Error()', 'bitbox02error', ' Bitbox02Error', 'XBitbox02Error'])(
    'should return null for the error type %j',
    (errorType) => {
      expect(parseBitbox02Error({ error_type: errorType, message: 'x' })).toBeNull()
    }
  )

  it.each([null, undefined, 'Bitbox02Error', 42, new Error('Bitbox02Error'), {}])('should return null for %j', (value) => {
    expect(parseBitbox02Error(value)).toBeNull()
  })
})
