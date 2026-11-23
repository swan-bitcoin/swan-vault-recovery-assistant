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
      return {
        loading: WAITING,
        bubble: 'Unlock your BitBox02. Enter your password on the device if it asks. To stop, unplug the BitBox02.',
      }
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
        // an unexpected registration can mean that the pasted descriptor is not the customer's vault, so both texts say when to stop
        bubble:
          update.name === WALLET_NAME
            ? `This BitBox02 does not know this wallet yet. This is normal after a reset or on a replacement device. The device now shows the wallet named ${update.name} with its keys. Compare each key with your recovery kit, then confirm on the device. If this BitBox02 was not reset and has signed for this vault before, stop and check the descriptor against your recovery kit.`
            : `This BitBox02 already holds a different wallet named ${WALLET_NAME}. This is expected only if you used this device for another Swan vault. If not, stop and check the descriptor against your recovery kit. To continue, compare each key with your recovery kit again, then confirm on the device, where the wallet shows as ${update.name}.`,
      }
    case 'sign':
      return { loading: WAITING, bubble: 'Check the address and the amount on your BitBox02, then confirm.' }
  }
}
