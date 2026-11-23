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
        bubble: `Your Trezor asks if it may connect to Swan Vault Recovery Assistant. Check the name on the Trezor, then allow the connection. ${STOP}`,
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
        bubble: `This Trezor has passphrase protection, and its standard wallet holds no key of this vault. Enter your passphrase on the Trezor. ${STOP}`,
      }
    case 'sign':
      return {
        loading: WAITING,
        // the device holds no vault, so it shows whatever keys SVRA sends; its address and amount are the only check left
        bubble: `Your Trezor now shows the transaction. It first warns that this is a multisig wallet. Check the address and the amount on the Trezor, then confirm. The Trezor does not know your vault and shows whatever keys SVRA sends, so the address and the amount on the Trezor are what you must check. ${STOP}`,
      }
  }
}
