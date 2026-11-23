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
        bubble:
          'Check that the code below is the same as the code on your BitBox02. If the codes are different, do not confirm. Unplug the BitBox02. If they are the same, confirm on the device.',
        code: update.code,
      }
    case 'checking-registration':
      return { loading: 'Checking that your BitBox02 knows this vault…' }
    case 'register':
      return {
        loading: WAITING,
        // an unexpected registration can mean that the pasted wallet configuration is not the customer's vault, so both texts say when to stop
        bubble:
          update.name === WALLET_NAME
            ? 'Your BitBox02 does not know this vault yet. This is normal if the BitBox02 was reset or is new. The BitBox02 now shows each key of the vault. Check each key against the wallet configuration on your Swan Vault Recovery Sheet, then confirm on the BitBox02. If your BitBox02 was not reset and you signed with it before, stop and unplug it: the wallet configuration you pasted may not be your vault.'
            : `Your BitBox02 already has a different wallet named ${WALLET_NAME}. This is normal only if you used this BitBox02 for another Swan vault. If you did not, stop: unplug the BitBox02 and check the wallet configuration against your Swan Vault Recovery Sheet. To continue, check each key again, then confirm on the BitBox02. It shows this vault as ${update.name}.`,
      }
    case 'sign':
      return { loading: WAITING, bubble: 'Check the address and the amount on your BitBox02, then confirm.' }
  }
}
