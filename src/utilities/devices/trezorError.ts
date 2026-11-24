import { parseDeviceError } from './deviceError'

export const parseTrezorError = (e: unknown) => parseDeviceError(e, 'TrezorError')
