import { parseDeviceError } from './deviceError'

export const parseBitbox02Error = (e: unknown) => parseDeviceError(e, 'Bitbox02Error')
