import { DOM } from '../dom'

export const hideTempMessage = () => {
  DOM.outputs.tempMessageContainer.classList.add('hidden')
}

export const showTempMessage = (content: string) => {
  DOM.outputs.tempMessage.textContent = content
  DOM.outputs.tempMessageContainer.classList.remove('hidden')
}

export const showTempLoadingMessage = (content: string) => {
  DOM.outputs.tempMessage.innerHTML = `<div class="flex items-center gap-2">${content ? `<span>${content}</span>` : ''}<span class="loading loading-spinner loading-sm"></span></div>`
  DOM.outputs.tempMessageContainer.classList.remove('hidden')
}
