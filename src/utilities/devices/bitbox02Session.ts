import { Channel } from '@tauri-apps/api/core'
import type { Bitbox02Progress } from '../../bindings'

export const BITBOX02_BUSY_MESSAGE =
  'A BitBox02 session is still open. Finish it on the BitBox02, or unplug the BitBox02 to stop it.'

export type SignRun = {
  // a device that is not a BitBox02 gives the guard back at once
  deviceFound: (deviceType: string) => void
  // the backend command has settled; the run itself may go on to show the result
  sessionEnded: () => void
  release: () => void
}

// One sign run at a time. sign() sets the guard on its first line; the run releases it when its device is not a
// BitBox02 or when the run ends.
let current: { bitbox02Pending: boolean } | null = null

// true while a BitBox02 run waits for the backend command, which can wait forever on the device
export const isBitbox02SessionPending = () => current?.bitbox02Pending === true

// returns null when a run is already in flight
export function startSignRun(): SignRun | null {
  if (current) return null

  const state = { bitbox02Pending: false }
  current = state

  // a run that released early must not release the guard of a later run
  const release = () => {
    if (current === state) current = null
  }

  return {
    deviceFound: (deviceType) => {
      if (deviceType === 'bitbox02') state.bitbox02Pending = true
      else release()
    },
    sessionEnded: () => {
      state.bitbox02Pending = false
    },
    release,
  }
}

// `start` calls the backend command with the channel it gets. `show` gets each update once.
export async function runBitbox02Session<T>(
  run: SignRun,
  start: (onProgress: Channel<Bitbox02Progress>) => Promise<T>,
  show: (update: Bitbox02Progress) => void
): Promise<T> {
  // the backend can send a message after the command has settled; it must not show a spinner after the result
  let isSettled = false
  // the register message arrives once per wallet name, so the name is part of the key
  const shown = new Set<string>()
  const onProgress = new Channel<Bitbox02Progress>()
  onProgress.onmessage = (update) => {
    if (isSettled) return
    const key = update.step === 'register' ? `register:${update.name}` : update.step
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
