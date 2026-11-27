import { describe, it, expect } from 'vitest'
import { parseTrezorError } from './trezorError'

describe('parseTrezorError()', () => {
  it('should return the message of a TrezorError', () => {
    expect(parseTrezorError({ error_type: 'TrezorError', message: 'You cancelled.' })).toStrictEqual({
      message: 'You cancelled.',
    })
  })

  it.each([
    ['an Error', new Error('x')],
    ['a string', 'TrezorError'],
    ['null', null],
    ['undefined', undefined],
    ['another error type', { error_type: 'Bitbox02Error', message: 'x' }],
    ['a missing message', { error_type: 'TrezorError' }],
    ['an empty message', { error_type: 'TrezorError', message: '' }],
    ['a message that is not text', { error_type: 'TrezorError', message: 5 }],
  ])('should return null for %s', (_name, value) => {
    expect(parseTrezorError(value)).toBeNull()
  })
})
