import { closeToast } from './closeToast'

export const showToast = (content) => {
  const toastContainer = document.getElementById('toast-container')
  toastContainer.classList.remove('hidden')
  const toastContent = document.getElementById('toast-container')
  toastContent.innerHTML = content
  // Toast content needs to add the close button
  const closeBtn = document.getElementById('close-toast-btn')
  if (closeBtn) {
    closeBtn.addEventListener('click', closeToast)
  }
}
