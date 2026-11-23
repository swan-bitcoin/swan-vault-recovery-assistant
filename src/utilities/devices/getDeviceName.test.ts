import { describe, it, expect } from 'vitest'
import { getDeviceName } from './getDeviceName'

const device = (type: string) => ({
  type,
  model: 'm',
  path: 'p',
  needs_pin_sent: false,
  needs_passphrase_sent: false,
  fingerprint: null,
  error: null,
  code: null,
})

describe('getDeviceName()', () => {
  it('should name a Jade', () => {
    expect(getDeviceName(device('jade'))).toBe('Jade')
  })

  it('should name a BitBox02', () => {
    expect(getDeviceName(device('bitbox02'))).toBe('BitBox02')
  })

  it('should sanitize an unknown device type', () => {
    expect(getDeviceName(device('<b>x</b>'))).toBe('&lt;b&gt;x&lt;/b&gt;')
  })
})
