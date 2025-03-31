import { clearStatusIndicators, DOM, getUserInputs, handleError } from './dom'
import { commands } from './bindings'
import { isChangeDescriptor } from './utilities'
import { simpleCheckmark } from './icons'

export const validateDescriptor = async () => {
  const { descriptors, network } = getUserInputs()
  clearStatusIndicators(DOM.inputs.receive)

  const descriptor = descriptors.receive
  if (!descriptor) {
    DOM.inputs.receive.classList.add('textarea-error')

    DOM.feedback.receiveInputValidationMessage.classList.remove('text-warning', 'text-success')
    DOM.feedback.receiveInputValidationMessage.classList.add('text-error')
    DOM.feedback.receiveInputValidationMessage.textContent = 'Wallet configuration is missing!'
    return false
  }

  try {
    const isValidDescriptor = await commands.isDescriptorForNetwork(descriptor, network)
    if (!isValidDescriptor) {
      DOM.inputs.receive.classList.add('textarea-error')

      DOM.feedback.receiveInputValidationMessage.classList.remove('text-warning', 'text-success')
      DOM.feedback.receiveInputValidationMessage.classList.add('text-error')
      DOM.feedback.receiveInputValidationMessage.textContent =
        'Your wallet configuration is for a different network. Open the network settings below to change the network!'
      return false
    }

    // Warning for change descriptor
    if (isChangeDescriptor(descriptor)) {
      DOM.inputs.receive.classList.add('textarea-warning')

      DOM.feedback.receiveInputValidationMessage.classList.remove('text-error', 'text-success')
      DOM.feedback.receiveInputValidationMessage.classList.add('text-warning')
      DOM.feedback.receiveInputValidationMessage.textContent =
        'You seem to be using a change descriptor for your wallet configuration. This may limit wallet functionality, such as showing only a partial balance instead of the full wallet balance.'
      return true
    }

    // Descriptor is valid, show now wallet actions and recovery options card (one way switch)
    DOM.inputs.receive.classList.add('textarea-success')

    DOM.feedback.receiveInputValidationMessage.classList.remove('text-error', 'text-warning')
    DOM.feedback.receiveInputValidationMessage.classList.add('text-success')
    DOM.feedback.receiveInputValidationMessage.textContent =
      'Your wallet configuration is valid. You can fetch your wallet now.'
    return true
  } catch (e: unknown) {
    console.error(e)
    DOM.inputs.receive.classList.add('textarea-error')

    DOM.feedback.receiveInputValidationMessage.classList.remove('text-warning', 'text-success')
    DOM.feedback.receiveInputValidationMessage.classList.add('text-error')
    DOM.feedback.receiveInputValidationMessage.textContent = 'Invalid wallet configuration!'
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
      DOM.buttons.broadcast.classList.remove('btn-disabled', 'hidden')
      DOM.buttons.sign.classList.add('btn-disabled', 'hidden')

      document.getElementById('missing-signature')?.classList.add('hidden')
    } else if (psbtStatus === 'PartiallySigned') {
      DOM.outputs.psbtStatus.innerHTML = `
        <span class="opacity-70">Partially Signed</span>
      `
      document.getElementById('missing-signature')?.classList.remove('hidden')
    } else if (psbtStatus === 'Unsigned') {
      DOM.outputs.psbtStatus.innerHTML = `
        <span class="opacity-70">Unsigned</span>
      `
      document.getElementById('missing-signature')?.classList.remove('hidden')
    }
  } catch (e: unknown) {
    handleError(e)
  }
}

export async function validateAddress() {
  const { address, descriptors, network } = getUserInputs()
  clearStatusIndicators(DOM.inputs.address)
  DOM.buttons.sweep.classList.remove('is-mine')

  if (!address) {
    // this message is really only needed to make sure a previous bad 'tempMessage' is cleared.
    DOM.inputs.address.classList.remove('input-error', 'input-warning', 'input-success')
    DOM.feedback.addressInputValidationMessage.textContent = ''
    return false
  }

  try {
    const isValid = await commands.isAddress(address)

    if (!isValid) {
      DOM.inputs.address.classList.add('input-error')
      DOM.feedback.addressInputValidationMessage.classList.remove('text-warning', 'text-success')
      DOM.feedback.addressInputValidationMessage.classList.add('text-error')
      DOM.feedback.addressInputValidationMessage.textContent = 'This address is not valid.'
      return false
    }

    const isForNetwork = await commands.isAddressForNetwork(address, network)
    if (!isForNetwork) {
      DOM.inputs.address.classList.add('input-error')
      DOM.feedback.addressInputValidationMessage.classList.remove('text-warning', 'text-success')
      DOM.feedback.addressInputValidationMessage.classList.add('text-error')
      DOM.feedback.addressInputValidationMessage.textContent = 'This address is not for the selected network'
      return false
    }

    const isMine = await commands.isAddressMine(address, network, descriptors)
    if (isMine) {
      DOM.feedback.addressInputValidationMessage.classList.remove('text-error', 'text-success')
      DOM.feedback.addressInputValidationMessage.classList.add('text-warning')
      DOM.feedback.addressInputValidationMessage.textContent =
        'Warning: This address belongs to the same wallet. Please be sure you intend to send this transaction to yourself.'
      DOM.inputs.address.classList.add('input-warning')
      DOM.buttons.sweep.classList.add('is-mine')
      return false
    }

    DOM.inputs.address.classList.add('input-success')
    DOM.feedback.addressInputValidationMessage.classList.remove('text-error', 'text-warning')
    DOM.feedback.addressInputValidationMessage.classList.add('text-success')
    DOM.feedback.addressInputValidationMessage.textContent = 'This address looks good!'
    return true
  } catch (e: unknown) {
    DOM.inputs.address.classList.add('input-error')
    handleError(e)
  }

  return false
}
