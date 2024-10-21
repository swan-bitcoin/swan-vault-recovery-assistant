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

function parseJson(val: unknown): unknown {
  if (typeof val !== 'string') {
    throw new Error(`Expected a JSON string response, found ${typeof val}.\nresponse: ${val}`)
  }
  const parsed = JSON.parse(val)
  if (parsed.error) {
    throw new Error(parsed.error)
  }
  return parsed
}

function parseDeviceResponse(val: unknown): DeviceResponse {
  const parsed = parseJson(val)

  const isDevice = (item: any): item is Device => {
    return (
      typeof item.type === 'string' &&
      typeof item.model === 'string' &&
      typeof item.path === 'string' &&
      typeof item.needs_pin_sent === 'boolean' &&
      typeof item.needs_passphrase_sent === 'boolean'
    )
  }

  if (!Array.isArray(parsed) || !parsed.every((item) => isDevice(item))) {
    throw new Error(`Invalid device list found when enumerating devices.\nresponse: ${val}`)
  }
  return parsed
}

function parseSignResponse(val: unknown): SignResponse {
  const parsed = parseJson(val)

  const isSignResponse = (item: any): item is SignResponse => {
    return typeof item.psbt === 'string' && typeof item.signed === 'boolean'
  }

  if (typeof parsed !== 'object' || !isSignResponse(parsed)) {
    throw new Error(`Invalid response when attempting to sign PSBT.\nresponse: ${val}`)
  }
  return parsed
}
