import { describe, it, expect } from 'vitest'
import { getBitbox02ModelName } from './bitbox02Model'

describe('getBitbox02ModelName()', () => {
  it.each([
    ['bitbox02_nova_btconly', 'BitBox02 Nova Bitcoin-only'],
    ['bitbox02_nova_multi', 'BitBox02 Nova Multi'],
    ['bitbox02_btconly', 'BitBox02 Bitcoin-only'],
    ['bitbox02_multi', 'BitBox02 Multi'],
  ])('should name %s', (model, name) => {
    expect(getBitbox02ModelName(model)).toBe(name)
  })

  it('should fall back to the family name for an unknown model', () => {
    expect(getBitbox02ModelName('<script>')).toBe('BitBox02')
    expect(getBitbox02ModelName('toString')).toBe('BitBox02')
  })
})
