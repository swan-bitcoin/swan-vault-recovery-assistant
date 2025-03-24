import { Device } from '../../parsing'

export function getDeviceName(device: Device) {
  switch (device.type) {
    case 'jade': {
      return 'Jade'
    }
    default: {
      return device.type
    }
  }
}
