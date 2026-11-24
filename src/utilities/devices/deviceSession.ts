import { Channel } from '@tauri-apps/api/core'
import type { Bitbox02Progress, TrezorProgress } from '../../bindings'
import { getSelfDrivenName, isSelfDrivenType, type SelfDrivenType } from './selfDriven'

// the backend's busy error for the BitBox02 uses the same sentence
export const getBusyMessage = (deviceType: SelfDrivenType) => {
  const name = getSelfDrivenName(deviceType)
  // At the code step the thing to do is in SVRA, so the Safe 7 sentence names that first. It holds at every other step.
  if (deviceType === 'trezor_safe7') {
    return `SVRA is still waiting for your ${name}. If SVRA asks for the 6-digit code, type it or select Cancel. Otherwise finish on the ${name}, or unplug it to stop. Then try again.`
  }
  return `SVRA is still waiting for your ${name}. Finish on the ${name}, or unplug it to stop. Then try again.`
}

export type SignRun = {
  // a device that SVRA does not drive itself gives the guard back at once
  deviceFound: (deviceType: string) => void
  // the backend command has settled; the run itself may go on to show the result
  sessionEnded: () => void
  release: () => void
}

// One sign run at a time. sign() sets the guard on its first line; the run releases it when its device is not one that
// SVRA drives itself or when the run ends.
let current: { pendingDevice: SelfDrivenType | null } | null = null

// the device whose backend command is waiting now, which can wait forever on the device
export const getPendingDevice = () => current?.pendingDevice ?? null

// returns null when a run is already in flight
export function startSignRun(): SignRun | null {
  if (current) return null

  const state: { pendingDevice: SelfDrivenType | null } = { pendingDevice: null }
  current = state

  // a run that released early must not release the guard of a later run
  const release = () => {
    if (current === state) current = null
  }

  return {
    deviceFound: (deviceType) => {
      if (isSelfDrivenType(deviceType)) state.pendingDevice = deviceType
      else release()
    },
    sessionEnded: () => {
      state.pendingDevice = null
    },
    release,
  }
}

// `start` calls the backend command with the channel it gets. `show` gets the updates that `isNew` lets through.
async function runSession<T, P>(
  run: SignRun,
  start: (onProgress: Channel<P>) => Promise<T>,
  show: (update: P) => void,
  isNew: (update: P) => boolean = () => true
): Promise<T> {
  // the backend can send a message after the command has settled; it must not show a spinner after the result
  let isSettled = false
  const onProgress = new Channel<P>()
  onProgress.onmessage = (update) => {
    if (isSettled) return
    if (isNew(update)) show(update)
  }

  try {
    return await start(onProgress)
  } finally {
    isSettled = true
    run.sessionEnded()
  }
}

// an update that the session already showed is not shown again; each session gets its own set
// the register message arrives once per wallet name, so the name is part of the key
export const runBitbox02Session = <T>(
  run: SignRun,
  start: (onProgress: Channel<Bitbox02Progress>) => Promise<T>,
  show: (update: Bitbox02Progress) => void
) => {
  const shown = new Set<string>()
  return runSession(run, start, show, (update) => {
    const key = update.step === 'register' ? `register:${update.name}` : update.step
    if (shown.has(key)) return false
    shown.add(key)
    return true
  })
}

// Every update is shown: the crate drops the repeats that mean nothing, so a step that comes again is on purpose.
// Examples are a second unlock and a second passphrase prompt, which the user must see.
export const runTrezorSession = <T>(
  run: SignRun,
  start: (onProgress: Channel<TrezorProgress>) => Promise<T>,
  show: (update: TrezorProgress) => void
) => runSession(run, start, show)
