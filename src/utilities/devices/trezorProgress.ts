import type { TrezorProgress } from '../../bindings'

export type TrezorStepMessage = {
  // shown in the status bar below the conversation, next to a spinner
  loading: string
  // shown once as a chat bubble; only for stages where the user must act
  bubble?: string
}

const WAITING = 'Waiting for your Trezor…'
const STOP = 'To stop, unplug the Trezor.'

export function getTrezorStepMessage(update: TrezorProgress): TrezorStepMessage {
  switch (update.step) {
    case 'connecting':
      return { loading: 'Connecting to your Trezor…' }
    case 'unlock':
      return { loading: WAITING, bubble: `Unlock your Trezor. Enter your PIN on the device. ${STOP}` }
    case 'confirm-connection':
      return {
        loading: WAITING,
        // the question is the one that the Trezor shows, word for word, so that the user can find it on the screen
        bubble: `Your Trezor asks: "Allow Swan Vault Recovery Assistant on this computer to pair with this Trezor?" Confirm on the Trezor. ${STOP}`,
      }
    case 'enter-pairing-code':
      return {
        loading: 'Waiting for the 6-digit code…',
        // the input and its buttons come after this bubble
        bubble:
          'Your Trezor shows a 6-digit code. Type it here. The code proves that SVRA talks to this Trezor and that nothing sits in between. SVRA asks for a code on every run, because it stores nothing. To stop, select Cancel or unplug the Trezor.',
      }
    case 'checking-key':
      return { loading: 'Checking that your Trezor holds a key of this vault…' }
    case 'passphrase':
      return {
        loading: WAITING,
        // The device can ask before or after SVRA checked the standard wallet, so the text must hold at both moments.
        bubble: `Your Trezor asks for your passphrase. Enter it on the Trezor. The key of this vault may be in the standard wallet or in a passphrase wallet. To open the standard wallet, confirm an empty passphrase. ${STOP}`,
      }
    case 'sign':
      return {
        loading: WAITING,
        // the Safe 7 shows no multisig warning and no keys; its address, amount and fee screens are the only check left
        bubble: `Your Trezor now shows the transaction. It does not know your vault and does not show its keys. It shows the address and the amount of each payment, then the total with the fee. Check them, then hold to confirm. ${STOP}`,
      }
  }
}
