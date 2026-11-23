import { Channel } from '@tauri-apps/api/core'
import type { Bitbox02Progress, TrezorProgress } from '../../bindings'
import { getSelfDrivenName, isSelfDrivenType, type SelfDrivenType } from './selfDriven'

// the backend's busy error for the BitBox02 uses the same sentence
export const getBusyMessage = (deviceType: SelfDrivenType) => {
  const name = getSelfDrivenName(deviceType)
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

// `start` calls the backend command with the channel it gets. `show` gets each update once, by its `keyOf`.
async function runSession<T, P>(
  run: SignRun,
  start: (onProgress: Channel<P>) => Promise<T>,
  show: (update: P) => void,
  keyOf: (update: P) => string
): Promise<T> {
  // the backend can send a message after the command has settled; it must not show a spinner after the result
  let isSettled = false
  const shown = new Set<string>()
  const onProgress = new Channel<P>()
  onProgress.onmessage = (update) => {
    if (isSettled) return
    const key = keyOf(update)
    if (shown.has(key)) return
    shown.add(key)
    show(update)
  }

  try {
    return await start(onProgress)
  } finally {
    isSettled = true
    run.sessionEnded()
  }
}

// the register message arrives once per wallet name, so the name is part of the key
export const runBitbox02Session = <T>(
  run: SignRun,
  start: (onProgress: Channel<Bitbox02Progress>) => Promise<T>,
  show: (update: Bitbox02Progress) => void
) => runSession(run, start, show, (update) => (update.step === 'register' ? `register:${update.name}` : update.step))

export const runTrezorSession = <T>(
  run: SignRun,
  start: (onProgress: Channel<TrezorProgress>) => Promise<T>,
  show: (update: TrezorProgress) => void
) => runSession(run, start, show, (update) => update.step)
