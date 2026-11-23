// Devices that SVRA drives itself, not through HWI. Their sign command can wait on the device for as long as the user
// takes, so SVRA must not start a second USB scan or a second sign run meanwhile.
const NAMES = {
  bitbox02: 'BitBox02',
  trezor_safe7: 'Trezor Safe 7',
} as const

export type SelfDrivenType = keyof typeof NAMES

// Object.hasOwn is newer than the WebKit of the oldest macOS that SVRA supports, and this runs for every device
export const isSelfDrivenType = (deviceType: string): deviceType is SelfDrivenType =>
  Object.prototype.hasOwnProperty.call(NAMES, deviceType)

export const getSelfDrivenName = (deviceType: SelfDrivenType) => NAMES[deviceType]

export const getFoundMessage = (deviceType: SelfDrivenType) => {
  const name = getSelfDrivenName(deviceType)
  return `Found your ${name}. Keep this window open: it tells you when to look at the ${name}.`
}

// SVRA lists only this device while it is connected, so the next signer stays hidden until the user unplugs it
export const getUnplugMessage = (deviceType: SelfDrivenType) => {
  const name = getSelfDrivenName(deviceType)
  return `Unplug the ${name} first, because SVRA lists only the ${name} while it is connected. Then connect another device to continue signing the transaction.`
}
