import { Device, sanitize } from '../../parsing'
import { getSelfDrivenName } from './selfDriven'

export function getDeviceName(device: Device) {
  switch (device.type) {
    case 'jade': {
      return 'Jade'
    }
    case 'bitbox02':
    case 'trezor_safe7': {
      return getSelfDrivenName(device.type)
    }
    default: {
      // Sanitize unknown device types to prevent XSS
      return sanitize(device.type)
    }
  }
}
