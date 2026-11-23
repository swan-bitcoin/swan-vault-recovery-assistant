import { PsbtSigningStatus } from './bindings'
import { Success } from './components'
import { getBitbox02ModelName } from './utilities/devices/bitbox02Model'

export type Device = {
  type: string
  model: string
  path: string
  needs_pin_sent: boolean
  needs_passphrase_sent: boolean
  fingerprint: string | null | undefined
  error: string | null | undefined
  code: number | null | undefined
}
type DeviceResponse = Device[]

type SignResponse = {
  psbt: string
  signed: boolean
  fingerprint?: unknown
  error: string | null | undefined
}

// Lets the sign flow tell a device problem from other errors without matching on message text.
export class DeviceError extends Error {
  constructor(
    readonly deviceType: string,
    message: string
  ) {
    super(message)
    this.name = 'DeviceError'
  }
}

const FINGERPRINT = /^[0-9a-fA-F]{8}$/

export function getDevice(val: unknown): Device {
  const devices = parseDeviceResponse(val)
  if (devices.length === 0) {
    throw new Error('No devices found')
  }
  if (devices.length > 1) {
    throw new Error('Multiple devices found. Please unplug all but one device.')
  }
  const device = devices[0]
  if (device.error) {
    throw new DeviceError(device.type, `Device error: ${device.error}`)
  }
  return device
}

export function getDeviceMessage(val: unknown): string {
  const devices = parseDeviceResponse(val)
  if (devices.length === 0) {
    return 'No devices found'
  }

  let message = devices.length === 1 ? `Found a ` : `Found ${devices.length} devices: [`

  devices.forEach((device, index, arr) => {
    const isBitbox02 = device.type === 'bitbox02'
    // Sanitize device.model to prevent XSS
    message = message.concat(`${isBitbox02 ? getBitbox02ModelName(device.model) : sanitize(device.model)} device `)
    if (device.error) {
      // Sanitize device.error to prevent XSS
      message = message.concat(`which is reporting an error: '${sanitize(device.error)}'`)
    } else if (device.fingerprint) {
      // Sanitize device.fingerprint to prevent XSS
      message = message.concat(`with fingerprint '${sanitize(device.fingerprint)}'`)
    } else if (isBitbox02) {
      // a BitBox02 gives its fingerprint only after it is paired and unlocked
      message = message.concat('(the fingerprint shows after the device is unlocked)')
    } else {
      message = message.concat('with no fingerprint')
    }
    if (index < arr.length - 1) {
      message = message.concat(', ')
    }
  })

  if (devices.length > 1) {
    message = message.concat(']')
  }
  return message
}

export function getDevicePrompt(val: unknown): string {
  const devices = parseDeviceResponse(val)
  if (devices.length === 0) {
    return 'Make sure your device is connected. Perhaps try a different cable.'
  }
  if (devices.length === 1) {
    return 'You may want to sign with this device next...'
  }
  return 'Make sure only one device is connected.'
}

export function getPsbtStatusMessage(status: PsbtSigningStatus) {
  let message
  switch (status) {
    case 'Unsigned':
      message = 'The transaction still is unsigned.'
      break
    case 'PartiallySigned':
      message =
        'The transaction is now partially signed. You need to add the signature from another key before you can broadcast it.'
      break
    case 'FullySigned':
      message = 'The transaction is fully signed 🎉. You can broadcast it now.'
      break
    default:
      message = 'The PSBT is in an unknown state.'
      break
  }
  return message
}

export function getSignResultAndPsbt(val: unknown): {
  message: string
  psbt: string
  signed: boolean
  fingerprint?: string
} {
  const signResponse = parseSignResponse(val)

  const message = signResponse.signed
    ? Success('Great! Added a signature to the transaction.')
    : 'A signature was not added, have you already signed with this device?'
  const fingerprint = signResponse.fingerprint
  return {
    message,
    psbt: signResponse.psbt,
    signed: signResponse.signed,
    ...(typeof fingerprint === 'string' && FINGERPRINT.test(fingerprint) ? { fingerprint } : {}),
  }
}

export function sanitize(input: string): string {
  const map = new Map([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ["'", '&#039;'],
  ])

  return input.replace(/[&<>"']/g, (m: string) => {
    return map.get(m) || m
  })
}

/**
 * parsing utilities, not exported
 */

const isDevice = (item: unknown): item is Device => {
  if (typeof item !== 'object' || item === null) return false

  const device = item as Device
  return (
    typeof device.type === 'string' &&
    typeof device.model === 'string' &&
    typeof device.path === 'string' &&
    typeof device.needs_pin_sent === 'boolean' &&
    typeof device.needs_passphrase_sent === 'boolean'
  )
}

const isSignResponse = (item: unknown): item is SignResponse => {
  if (typeof item !== 'object' || item === null) return false
  const signResponse = item as SignResponse
  return typeof signResponse.psbt === 'string' && typeof signResponse.signed === 'boolean'
}

function parseDeviceResponse(val: unknown): DeviceResponse {
  const parsed = parseJson(val)

  if (!Array.isArray(parsed) || !parsed.every((item) => isDevice(item))) {
    throw new Error(`Invalid device list found when enumerating devices.\nresponse: ${val}`)
  }
  return parsed
}

function parseJson(val: unknown): unknown {
  if (typeof val !== 'string') {
    throw new Error(`Expected a JSON string response, found ${typeof val}.\nresponse: ${val}`)
  }
  const parsed = JSON.parse(val)
  if (parsed?.error) {
    throw new Error(parsed.error)
  }
  return parsed
}

function parseSignResponse(val: unknown): SignResponse {
  const parsed = parseJson(val)

  if (!isSignResponse(parsed)) {
    throw new Error(`Invalid response when attempting to sign PSBT.\nresponse: ${val}`)
  }
  return parsed
}

export const TEST = {
  isDevice,
  isSignResponse,
  parseJson,
  parseDeviceResponse,
  parseSignResponse,
}
