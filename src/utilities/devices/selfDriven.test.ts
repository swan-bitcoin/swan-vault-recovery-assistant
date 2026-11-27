import { describe, it, expect } from 'vitest'
import { getFoundMessage, getSelfDrivenName, getUnplugMessage, isSelfDrivenType } from './selfDriven'

describe('isSelfDrivenType()', () => {
  it.each(['bitbox02', 'trezor_safe7'])('should accept %s', (type) => {
    expect(isSelfDrivenType(type)).toBe(true)
  })

  it.each(['jade', 'trezor', 'ledger', '', 'toString', '__proto__'])('should refuse %j', (type) => {
    expect(isSelfDrivenType(type)).toBe(false)
  })
})

describe('getSelfDrivenName()', () => {
  it('should name the devices', () => {
    expect(getSelfDrivenName('bitbox02')).toBe('BitBox02')
    expect(getSelfDrivenName('trezor_safe7')).toBe('Trezor Safe 7')
  })
})

describe('getFoundMessage()', () => {
  it('should keep the BitBox02 sentence', () => {
    expect(getFoundMessage('bitbox02')).toBe(
      'Found your BitBox02. Keep this window open: it tells you when to look at the BitBox02.'
    )
  })

  it('should name the Safe 7', () => {
    expect(getFoundMessage('trezor_safe7')).toBe(
      'Found your Trezor Safe 7. Keep this window open: it tells you when to look at the Trezor Safe 7.'
    )
  })
})

describe('getUnplugMessage()', () => {
  it('should keep the BitBox02 sentence', () => {
    expect(getUnplugMessage('bitbox02')).toBe(
      'Unplug the BitBox02 first, because SVRA lists only the BitBox02 while it is connected. Then connect another device to continue signing the transaction.'
    )
  })

  it('should tell the user to unplug the Safe 7 before the next device', () => {
    const message = getUnplugMessage('trezor_safe7')
    expect(message).toContain('Unplug the Trezor Safe 7 first')
    expect(message).toContain('SVRA lists only the Trezor Safe 7 while it is connected')
  })
})
