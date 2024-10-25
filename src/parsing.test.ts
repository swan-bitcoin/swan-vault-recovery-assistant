import { describe, it, expect } from 'vitest'
import * as parsing from './parsing'

// TODO: parsing interface functions

/**
 * parsing utilities, not exported
 */

describe('getDevice()', () => {
  it('should successfully return a single device when present', () => {
    const str = '[{"type":"jade","model":"jade","path":"/dev/ttyACM0","needs_pin_sent":false,"needs_passphrase_sent":false}]'

    const device = parsing.getDevice(str)
    expect(device).toEqual({
      type: 'jade',
      model: 'jade',
      path: '/dev/ttyACM0',
      needs_pin_sent: false,
      needs_passphrase_sent: false,
    })
  })
})

describe('isDevice()', () => {
  it.each([
    {
      type: 'coolcard',
      model: 'mk9000+',
      path: '/dev/null',
      needs_pin_sent: false,
      needs_passphrase_sent: false,
    },
    {
      type: 'coolcard',
      model: 'mk9000+',
      path: '/dev/null',
      needs_pin_sent: false,
      needs_passphrase_sent: false,
      fingerprint: '12345678',
      error: 'bad stuff',
      code: 13,
    },
    {
      type: 'coolcard',
      model: 'mk9000+',
      path: '/dev/null',
      needs_pin_sent: false,
      needs_passphrase_sent: false,
      someotherproperties: true,
    },
  ])('should return true for a valid device', (device) => {
    expect(parsing.TEST.isDevice(device)).toBe(true)
  })

  it.each([
    null,
    undefined,
    13,
    NaN,
    [],
    42n,
    false,
    {},
    { type: 'a' },
    { type: 'a', model: 'b' },
    { type: 'a', model: 'b', path: 'c' },
    { type: 'a', model: 'b', path: 'c', needs_pin_sent: true },
    { typez: 'a', model: 'b', path: 'c', needs_pin_sent: true, needs_passphrase_sent: true },
    { type: 5, model: 'b', path: 'c', needs_pin_sent: true, needs_passphrase_sent: true },
    { type: 'a', model: {}, path: 'c', needs_pin_sent: true, needs_passphrase_sent: true },
    { type: 'a', model: 'b', path: null, needs_pin_sent: true, needs_passphrase_sent: true },
    { type: 'a', model: 'b', path: 'c', needs_pin_sent: 'true', needs_passphrase_sent: true },
    { type: 'a', model: 'b', path: 'c', needs_pin_sent: true, needs_passphrase_sent: 42 },
  ])('should return false for an invalid device -- %s', (device) => {
    expect(parsing.TEST.isDevice(device)).toBe(false)
  })
})

describe('isSignResponse()', () => {
  it.each([
    {
      psbt: 'psbt',
      signed: false,
    },
    {
      psbt: 'psbt',
      signed: false,
      error: 'bad stuff',
    },
    {
      psbt: 'psbt',
      signed: false,
      error: null,
    },
    {
      psbt: 'psbt',
      signed: true,
      someotherproperties: true,
    },
  ])('should return true for a valid sign response', (response) => {
    expect(parsing.TEST.isSignResponse(response)).toBe(true)
  })

  it.each([
    null,
    undefined,
    13,
    NaN,
    [],
    42n,
    false,
    {},
    { psbt: 'a' },
    { psbt: 'a', signed: 'b' },
    { somethingelse: 'a', signed: true },
  ])('should return false for an invalid sign response -- %s', (response) => {
    expect(parsing.TEST.isSignResponse(response)).toBe(false)
  })
})

describe('parseDeviceResponse()', () => {
  it('should return a valid list of devices', () => {
    const devices = [
      {
        type: 'a',
        model: 'b',
        path: 'c',
        needs_pin_sent: false,
        needs_passphrase_sent: false,
      },
      {
        type: 'd',
        model: 'e',
        path: 'f',
        needs_pin_sent: false,
        needs_passphrase_sent: false,
        fingerprint: '12345678',
        error: 'bad stuff',
        code: 13,
      },
      {
        type: 'g',
        model: 'h',
        path: 'i',
        needs_pin_sent: false,
        needs_passphrase_sent: false,
        someotherproperties: true,
      },
    ]
    expect(parsing.TEST.parseDeviceResponse(JSON.stringify(devices))).toStrictEqual(devices)
  })

  it('should return an empty list of devices', () => {
    expect(parsing.TEST.parseDeviceResponse('[]')).toStrictEqual([])
  })

  it.each([
    {},
    {
      type: 'a',
      model: 'b',
      path: 'c',
      needs_pin_sent: false,
      needs_passphrase_sent: false,
    }, // not an array
    [{ type: 'a' }], // incomplete device
    [
      {
        type: 'a',
        model: 'b',
        path: 'c',
        needs_pin_sent: false,
        needs_passphrase_sent: false,
      },
      {
        type: 'a',
        model: 'b',
        path: 'c',
        needs_pin_sent: false,
      },
    ], // one device incomplete
  ])('should throw an error for an invalid device list -- %s', (devices) => {
    expect(() => parsing.TEST.parseDeviceResponse(JSON.stringify(devices))).toThrowError(/Invalid device list/)
  })
})

describe('parseJson()', () => {
  it.each(['null', '{}', '[]', '[1,2,3]', '[{"device":"d"},{"device":"d"}]'])(
    'should successfully parse json without errors -- %s',
    (str) => {
      expect(() => parsing.TEST.parseJson(str)).not.toThrow()
    }
  )

  it.each([{}, null, undefined])('should not parse an invalid input -- %s', (input) => {
    expect(() => parsing.TEST.parseJson(input)).toThrowError(/Expected a JSON string/)
  })

  // throws an error from JSON.parse, which we should not test exhaustively.
  it("should not parse an invalid input -- 'undefined'", () => {
    expect(() => parsing.TEST.parseJson('undefined')).toThrowError()
  })

  it('should throw an error when the json string contains an error property', () => {
    expect(() => parsing.TEST.parseJson('{"error":"stuff happened"}')).toThrowError(/stuff happened/)
  })
})

describe('parseSignResponse()', () => {
  it('should return a valid sign response', () => {
    const response = {
      psbt: 'a',
      signed: false,
    }

    expect(parsing.TEST.parseSignResponse(JSON.stringify(response))).toStrictEqual(response)
  })

  it.each([
    null,
    [],
    {},
    [
      {
        psbt: 'a',
        signed: true,
      },
    ],
    {
      psbt: 'a',
    },
    {
      signed: true,
    },
  ])('should throw an error for an invalid sign response -- %s', (obj) => {
    expect(() => parsing.TEST.parseSignResponse(JSON.stringify(obj))).toThrowError(/Invalid response/)
  })
})
