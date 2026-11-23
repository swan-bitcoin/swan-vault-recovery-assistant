import { Channel } from '@tauri-apps/api/core'
import type { Bitbox02Progress } from '../../bindings'

// The backend allows one BitBox02 session at a time. The UI uses this to start no second run while one is pending.
let isPending = false

export const isBitbox02SessionPending = () => isPending

// `start` calls the backend command with the channel it gets. `show` gets each update once.
export async function runBitbox02Session<T>(
  start: (onProgress: Channel<Bitbox02Progress>) => Promise<T>,
  show: (update: Bitbox02Progress) => void
): Promise<T> {
  // a run that finds a session already pending must not clear the flag of that session
  const ownsSession = !isPending
  isPending = true

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
    if (ownsSession) isPending = false
  }
}
