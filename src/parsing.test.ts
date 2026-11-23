import { describe, it, expect } from 'vitest'
import * as parsing from './parsing'

const DEVICE1 = {
  type: 'a',
  model: 'b',
  path: 'c',
  needs_pin_sent: false,
  needs_passphrase_sent: false,
}
const DEVICE2 = {
  type: 'd',
  model: 'e',
  path: 'f',
  needs_pin_sent: false,
  needs_passphrase_sent: true,
  fingerprint: '12345678',
}
const DEVICE3 = {
  type: 'g',
  model: 'h',
  path: 'i',
  needs_pin_sent: true,
  needs_passphrase_sent: true,
}

/**
 * parsing interface
 */

describe('getDevice()', () => {
  it('should successfully return a single device when present', () => {
    const str = '[{"type":"jade","model":"jade","path":"/dev/ttyACM0","needs_pin_sent":false,"needs_passphrase_sent":false}]'

    const device = parsing.getDevice(str)
    expect(device).toStrictEqual({
      type: 'jade',
      model: 'jade',
      path: '/dev/ttyACM0',
      needs_passphrase_sent: false,
      needs_pin_sent: false,
    })
  })

  it('should throw an error when no devices are present', () => {
    expect(() => parsing.getDevice('[]')).toThrowError(/No devices found/)
  })

  it('should throw an error when multiple devices are present', () => {
    const devices = [DEVICE1, DEVICE2]
    expect(() => parsing.getDevice(JSON.stringify(devices))).toThrowError(/Multiple devices found/)
  })

  it('should throw an error when a device reports an error', () => {
    const devices = [
      {
        ...DEVICE1,
        error: 'cheeseburger',
      },
    ]
    expect(() => parsing.getDevice(JSON.stringify(devices))).toThrowError(/cheeseburger/)
  })
})

describe('getDeviceMessage()', () => {
  it('should return a message when no devices are present', () => {
    expect(parsing.getDeviceMessage('[]')).toBe('No devices found')
  })

  it('should return a message when a single device is present with no fingerprint', () => {
    const devices = [DEVICE1]
    expect(parsing.getDeviceMessage(JSON.stringify(devices))).toMatch(/Found a .* device with no fingerprint/)
  })

  it('should return a message when a single device is present with a fingerprint', () => {
    const devices = [DEVICE2]
    expect(parsing.getDeviceMessage(JSON.stringify(devices))).toMatch(/Found a .* device with fingerprint '[a-fA-F0-9]{8}'/)
  })

  it('should print a readable name for a BitBox02 and not claim it has no fingerprint', () => {
    const devices = [{ ...DEVICE1, type: 'bitbox02', model: 'bitbox02_nova_btconly', fingerprint: null }]
    const message = parsing.getDeviceMessage(JSON.stringify(devices))
    expect(message).toContain('BitBox02 Nova Bitcoin-only')
    expect(message).toContain('SVRA reads its fingerprint when you sign')
    expect(message).toContain('SVRA lists only the BitBox02')
    expect(message).not.toContain('no fingerprint')
  })

  it('should not add the BitBox02 sentence for other devices', () => {
    const devices = [DEVICE1, { ...DEVICE3, error: 'cheeseburger' }]
    expect(parsing.getDeviceMessage(JSON.stringify(devices))).not.toContain('BitBox02')
  })

  it('should print the BitBox02 error when the device is in bootloader mode', () => {
    const devices = [{ ...DEVICE1, type: 'bitbox02', model: 'bitbox02_multi', error: 'bootloader mode', code: -12 }]
    const message = parsing.getDeviceMessage(JSON.stringify(devices))
    expect(message).toContain('BitBox02 Multi')
    expect(message).toContain("reporting an error: 'bootloader mode'")
    expect(message).toContain('SVRA lists only the BitBox02')
  })

  it('should return a message when multiple devices are present', () => {
    const devices = [DEVICE1, DEVICE2, { ...DEVICE3, error: 'cheeseburger' }]
    expect(parsing.getDeviceMessage(JSON.stringify(devices))).toMatch(
      /Found 3 devices: \[.* device with no fingerprint, .* device with fingerprint '12345678', .* device which is reporting an error.*\]/
    )
  })
})

describe('getDevicePrompt()', () => {
  it('should return a message when no devices are present', () => {
    expect(parsing.getDevicePrompt('[]')).toMatch(/Make sure your device is connected/)
  })

  it('should return a message when a single device is present', () => {
    const devices = [DEVICE1]
    expect(parsing.getDevicePrompt(JSON.stringify(devices))).toMatch(/You may want to sign with this device/)
  })

  it('should not suggest signing with a BitBox02 that reports an error', () => {
    const devices = [{ ...DEVICE1, type: 'bitbox02', model: 'bitbox02_multi', error: 'bootloader mode', code: -12 }]
    const prompt = parsing.getDevicePrompt(JSON.stringify(devices))
    expect(prompt).toContain('cannot sign yet')
    expect(prompt).not.toMatch(/You may want to sign with this device/)
  })

  it('should keep the usual message for a BitBox02 without an error', () => {
    const devices = [{ ...DEVICE1, type: 'bitbox02', model: 'bitbox02_multi', fingerprint: null }]
    expect(parsing.getDevicePrompt(JSON.stringify(devices))).toMatch(/You may want to sign with this device/)
  })

  it('should keep the usual message for another device that reports an error', () => {
    const devices = [{ ...DEVICE3, error: 'cheeseburger' }]
    expect(parsing.getDevicePrompt(JSON.stringify(devices))).toMatch(/You may want to sign with this device/)
  })

  it('should return a message when more than one device is present', () => {
    const devices = [DEVICE1, DEVICE2]
    expect(parsing.getDevicePrompt(JSON.stringify(devices))).toMatch(/Make sure only one device is connected/)
  })
})

describe('getSignResultAndPsbt()', () => {
  it('should return a message and psbt when a valid response is present', () => {
    const response = {
      psbt: 'a',
      signed: false,
    }

    expect(parsing.getSignResultAndPsbt(JSON.stringify(response))).toStrictEqual({
      message: 'A signature was not added, have you already signed with this device?',
      psbt: 'a',
      signed: false,
    })
  })

  it('should return a message and psbt when a valid response is present', () => {
    const response = {
      psbt: 'b',
      signed: true,
    }

    const result = parsing.getSignResultAndPsbt(JSON.stringify(response))
    expect(result).toEqual(
      expect.objectContaining({
        psbt: 'b',
        signed: true,
      })
    )
    expect(result.message).toContain('Added a signature')
  })
})

describe('getSignResultAndPsbt() fingerprint', () => {
  it('should return the fingerprint when it has 8 hex characters', () => {
    const response = { psbt: 'b', signed: true, fingerprint: '1a2b3c4d' }
    expect(parsing.getSignResultAndPsbt(JSON.stringify(response)).fingerprint).toBe('1a2b3c4d')
  })

  it('should leave out the fingerprint when the response has none', () => {
    const result = parsing.getSignResultAndPsbt(JSON.stringify({ psbt: 'b', signed: true }))
    expect(result).not.toHaveProperty('fingerprint')
  })

  it.each(['1a2b3c', '1a2b3c4d5e', 'zzzzzzzz', '<b>1a2b</b>', '', 12345678, null])(
    'should ignore the malformed fingerprint %j',
    (fingerprint) => {
      const result = parsing.getSignResultAndPsbt(JSON.stringify({ psbt: 'b', signed: true, fingerprint }))
      expect(result).not.toHaveProperty('fingerprint')
      expect(result.psbt).toBe('b')
      expect(result.signed).toBe(true)
    }
  )
})

describe('getDevice() with a BitBox02 error', () => {
  it('should throw a DeviceError that names the device type', () => {
    const devices = [{ ...DEVICE1, type: 'bitbox02', error: 'bootloader mode' }]
    try {
      parsing.getDevice(JSON.stringify(devices))
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(parsing.DeviceError)
      expect(e).toBeInstanceOf(Error)
      expect((e as parsing.DeviceError).deviceType).toBe('bitbox02')
      expect((e as Error).message).toBe('Device error: bootloader mode')
    }
  })
})

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
        ...DEVICE2,
        error: 'bad stuff',
        code: 13,
      },
      {
        ...DEVICE3,
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
    DEVICE1, // not an array
    [{ type: 'a' }], // incomplete device
    [
      DEVICE1,
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
