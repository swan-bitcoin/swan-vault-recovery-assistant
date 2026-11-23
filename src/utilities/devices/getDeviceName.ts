import { Device, sanitize } from '../../parsing'

export function getDeviceName(device: Device) {
  switch (device.type) {
    case 'jade': {
      return 'Jade'
    }
    case 'bitbox02': {
      return 'BitBox02'
    }
    default: {
      // Sanitize unknown device types to prevent XSS
      return sanitize(device.type)
    }
  }
}
