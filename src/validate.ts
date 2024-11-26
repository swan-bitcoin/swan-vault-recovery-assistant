import { clearStatusIndicators, DOM, getUserInputs, handleError } from './dom'
import { commands } from './bindings'
import { isChangeDescriptor } from './utilities'
import { simpleCheckmark } from './icons'

export const validateDescriptor = async () => {
  const descriptor = DOM.inputs.receive.value
  const network = Array.from(DOM.inputs.networkRadios).find((radio) => radio.checked).value
  const standardWalletActions = document.getElementById('standard-wallet-actions')

  if (!descriptor) {
    DOM.outputs.tempMessage.textContent = 'Wallet configuration is missing!'
    DOM.inputs.receive.classList.add('textarea-error')
    DOM.inputs.receive.classList.remove('textarea-success')
    DOM.inputs.receive.classList.remove('textarea-warning')
    return false
  }

  try {
    const isValidDescriptor = await commands.isDescriptorForNetwork(descriptor, network)
    if (!isValidDescriptor) {
      DOM.outputs.tempMessage.textContent =
        'Descriptor is fine but it is for the wrong network. Open the network settings to the right to change the network!'
      DOM.inputs.receive.classList.add('textarea-error')
      DOM.inputs.receive.classList.remove('textarea-success')
      DOM.inputs.receive.classList.remove('textarea-warning')
      return false
    }

    // Warning for change descriptor
    if (isChangeDescriptor(descriptor)) {
      DOM.outputs.tempMessage.textContent =
        'You seem to be using a change descriptor for your wallet configuration. This may limit wallet functionality, such as showing only a partial balance instead of the full wallet balance.'
      DOM.inputs.receive.classList.add('textarea-warning')
      DOM.inputs.receive.classList.remove('textarea-success')
      DOM.inputs.receive.classList.remove('textarea-error')
      standardWalletActions.classList.remove('hidden')
      return true
    }

    // Descriptor is valid, show now wallet actions and recovery options card (one way switch)
    DOM.inputs.receive.classList.add('textarea-success')
    DOM.inputs.receive.classList.remove('textarea-error')
    DOM.inputs.receive.classList.remove('textarea-warning')
    DOM.outputs.tempMessage.textContent =
      'Your wallet configuration is valid. You can now fetch your wallet and perform other actions.'
    standardWalletActions.classList.remove('hidden')
    return true
  } catch (e: unknown) {
    console.error(e)
    DOM.outputs.tempMessage.textContent = 'Invalid wallet configuration!'
    DOM.inputs.receive.classList.add('textarea-error')
    DOM.inputs.receive.classList.remove('textarea-success')
    DOM.inputs.receive.classList.remove('textarea-warning')
    return false
  }
}

export async function validatePsbt() {
  const { psbt, network, descriptors } = getUserInputs()
  clearStatusIndicators(DOM.outputs.psbtTextArea)

  try {
    const isValid = await commands.isPsbt(psbt)
    if (!isValid) {
      DOM.outputs.psbtTextArea.classList.add('textarea-error')
      DOM.outputs.psbtStatus.innerHTML = `
      <span class="text-error">Invalid PSBT</span>
    `
      return
    }

    const psbtStatus = await commands.psbtStatus(psbt, network, descriptors)
    if (psbtStatus === 'FullySigned') {
      DOM.outputs.psbtTextArea.classList.add('textarea-success')
      DOM.outputs.psbtStatus.innerHTML = `
        <span class="text-success">Fully Signed ${simpleCheckmark}</span>
      `
      DOM.buttons.broadcast.classList.remove('btn-disabled')
    } else if (psbtStatus === 'PartiallySigned') {
      DOM.outputs.psbtStatus.innerHTML = `
        <span class="text-warning">Partially Signed</span>
      `
    } else if (psbtStatus === 'Unsigned') {
      DOM.outputs.psbtStatus.innerHTML = `
        <span class="text-neutral-500">Unsigned</span>
      `
    }
  } catch (e: unknown) {
    handleError(e)
  }
}

export async function validateAddress() {
  const { address, descriptors, network } = getUserInputs()
  DOM.inputs.address.classList.remove('input-success')
  DOM.inputs.address.classList.remove('input-error')
  DOM.inputs.address.classList.remove('input-warning')

  if (!address) {
    // this message is really only needed to make sure a previous bad 'tempMessage' is cleared.
    DOM.outputs.tempMessage.textContent = 'No address provided'
    return false
  }

  try {
    const isValid = await commands.isAddress(address)
    if (!isValid) {
      DOM.inputs.address.classList.add('input-error')
      DOM.outputs.tempMessage.textContent = 'This address is not valid.'
      return false
    }

    const isForNetwork = await commands.isAddressForNetwork(address, network)
    if (!isForNetwork) {
      DOM.inputs.address.classList.add('input-error')
      DOM.outputs.tempMessage.textContent = 'This address is not for the selected network'
      return false
    }

    const isMine = await commands.isAddressMine(address, network, descriptors)
    if (isMine) {
      DOM.outputs.tempMessage.textContent =
        'Warning: This address belongs to the same wallet. Please be sure you intend to send this transaction to yourself.'
      DOM.inputs.address.classList.add('input-warning')
      return false
    }

    DOM.inputs.address.classList.add('input-success')
    DOM.outputs.tempMessage.textContent = 'This address looks good!'
    return true
  } catch (e: unknown) {
    DOM.inputs.address.classList.add('input-error')
    handleError(e)
  }

  return false
}
