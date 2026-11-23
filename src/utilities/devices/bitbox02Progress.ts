import type { Bitbox02Progress } from '../../bindings'

export type Bitbox02StepMessage = {
  // shown in the status bar below the conversation, next to a spinner
  loading: string
  // shown once as a chat bubble; only for stages where the user must act
  bubble?: string
  // the pairing code; the caller must insert it as text
  code?: string
}

const WAITING = 'Waiting for your BitBox02…'

// The name the webapp registers. The backend sends another name only when the device already uses this one.
const WALLET_NAME = 'swan_vault'

export function getBitbox02StepMessage(update: Bitbox02Progress): Bitbox02StepMessage {
  switch (update.step) {
    case 'connecting':
      return { loading: 'Connecting to your BitBox02…' }
    case 'unlock':
      return { loading: WAITING, bubble: 'Unlock your BitBox02. Enter your password on the device if it asks.' }
    case 'confirm-pairing':
      return {
        loading: WAITING,
        bubble: 'Check that the code below is the same as the code on your BitBox02. Then confirm on the device.',
        code: update.code,
      }
    case 'checking-registration':
      return { loading: 'Checking that your BitBox02 knows this wallet…' }
    case 'register':
      return {
        loading: WAITING,
        bubble:
          update.name === WALLET_NAME
            ? `This BitBox02 does not know this wallet yet. This is normal after a reset or on a replacement device. The device now shows the wallet named ${update.name} with its keys. Compare each key with your recovery kit, then confirm on the device.`
            : `The name ${WALLET_NAME} is already used for another wallet on this BitBox02. SVRA registers this wallet as ${update.name}. The device shows the wallet with its keys. Compare each key with your recovery kit again, then confirm on the device.`,
      }
    case 'sign':
      return { loading: WAITING, bubble: 'Check the address and the amount on your BitBox02, then confirm.' }
  }
}
