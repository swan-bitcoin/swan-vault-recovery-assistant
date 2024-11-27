import { DOM } from './dom'

export const closeToast = () => {
  DOM.containers.toast.innerHTML = ''
  DOM.containers.toast.classList.add('hidden')
}

export const showToast = (content: string) => {
  DOM.containers.toast.classList.remove('hidden')
  DOM.containers.toast.innerHTML = content
  const closeBtn = document.getElementById('close-toast-btn')
  if (closeBtn) {
    closeBtn.addEventListener('click', closeToast)
  }
}
