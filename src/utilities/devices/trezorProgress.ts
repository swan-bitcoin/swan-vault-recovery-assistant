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
        // The Trezor shows the question in the language that the user chose, so the English text is only an example.
        bubble: `Your Trezor asks you to allow the pairing. In English, it asks: "Allow Swan Vault Recovery Assistant on this computer to pair with this Trezor?" Confirm on the Trezor. ${STOP}`,
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
        // The device can ask before or after SVRA checked the standard wallet, and an empty passphrase helps only a Trezor
        // that always asks. So the text gives no advice about the passphrase itself.
        bubble: `Your Trezor asks for your passphrase. Enter it on the Trezor. The key of this vault may be in the standard wallet or in a passphrase wallet. ${STOP}`,
      }
    case 'sign':
      return {
        loading: WAITING,
        // The Safe 7 shows no multisig warning and no keys. SVRA sends every output as a recipient, also one that returns
        // to the vault, so the address and amount screens are the check that is left. The sweep that SVRA builds is valid
        // from the current block height, so the Trezor shows a lock-time screen between the outputs and the total.
        bubble: `Your Trezor now shows the transaction. It does not know your vault and does not show its keys. First it shows every output as a recipient, with its address and its amount. An output that returns to your vault is shown too. Check every address and every amount. If the Trezor shows an address that you do not expect, do not confirm. Next it shows a lock-time screen. In English, it says "Confirm Locktime" and "Locktime set to blockheight", with a number. This is normal: the transaction is valid from the current block height. Confirm it. Last it shows the total with the fee. If all are right, hold the "Hold to sign" button. ${STOP}`,
      }
  }
}
