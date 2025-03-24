import { DOM } from '../dom'
import { scrollToLastMessage } from './scrollToLastMessage'

export const hideTempMessage = () => {
  DOM.outputs.tempMessageContainer.classList.add('hidden')
}

export const showTempMessage = (content: string) => {
  DOM.outputs.tempMessage.textContent = content
  DOM.outputs.tempMessageContainer.classList.remove('hidden')

  scrollToLastMessage()
}

export const showTempLoadingMessage = (content: string) => {
  DOM.outputs.tempMessage.innerHTML = `<div class="flex items-center gap-2">${content ? `<span>${content}</span>` : ''}<span class="loading loading-spinner loading-sm opacity-70"></span></div>`
  DOM.outputs.tempMessageContainer.classList.remove('hidden')

  scrollToLastMessage()
}
