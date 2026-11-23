import type { Bitbox02Progress } from '../../bindings'

export type Bitbox02StepMessage = {
  // shown in the status bar below the conversation, next to a spinner
  loading: string
  // shown once as a chat bubble; only for steps where the user must act
  bubble?: string
  // the pairing code; the caller must insert it as text
  code?: string
}

const WAITING = 'Waiting for your BitBox02…'

export function getBitbox02StepMessage(progress: Bitbox02Progress): Bitbox02StepMessage {
  switch (progress.step) {
    case 'connecting':
      return { loading: 'Connecting to your BitBox02…' }
    case 'unlock':
      return { loading: WAITING, bubble: 'Enter your password on the BitBox02.' }
    case 'confirm-pairing':
      return {
        loading: WAITING,
        bubble: 'Check that the code below is the same as the code on your BitBox02. Then confirm on the device.',
        code: progress.code,
      }
    case 'checking-registration':
      return { loading: 'Checking that your BitBox02 knows this wallet…' }
    case 'register':
      return {
        loading: WAITING,
        bubble:
          'This BitBox02 does not know this wallet yet. This is normal after a reset or on a replacement device. The device now shows the wallet named swan_vault with its keys. Compare each key with your recovery kit, then confirm on the device.',
      }
    case 'sign':
      return { loading: WAITING, bubble: 'Check the address and the amount on your BitBox02, then confirm.' }
  }
}
