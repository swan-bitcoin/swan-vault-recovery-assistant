type Device = {
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
  error: string | null | undefined
}

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
    throw new Error(`Device error: ${device.error}`)
  }
  return device
}

export function getDevicePrompt(val: unknown): string {
  const devices = parseDeviceResponse(val)
  if (devices.length === 1) {
    return 'You may want to sign with this device next...'
  }
  if (devices.length === 0) {
    return 'Make sure your device is connected. Perhaps try a different cable.'
  }
  return 'Make sure only one device is connected.'
}

export function getDeviceMessage(val: unknown): string {
  const devices = parseDeviceResponse(val)
  if (devices.length === 0) {
    return 'No devices found'
  }

  let message = devices.length === 1 ? `Found ` : `Found ${devices.length} devices: [`

  devices.forEach((device, index, arr) => {
    message = message.concat(`a ${device.model} device`)
    if (device.error) {
      message = message.concat(` which is reporting an error: '${device.error}'`)
    } else if (device.fingerprint) {
      message = message.concat(` with fingerprint '${device.fingerprint}'`)
    } else {
      message = message.concat(' no fingerprint')
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

export function getSignMessageAndPsbt(val: unknown): {
  message: string
  signedPsbt: string
} {
  const signResponse = parseSignResponse(val)

  const message = signResponse.signed ? 'PSBT signed successfully' : 'PSBT not signed'
  return { message, signedPsbt: signResponse.psbt }
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
