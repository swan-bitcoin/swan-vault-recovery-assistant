export const closeToast = () => {
  const toastContainer = document.getElementById('toast-container')
  const toastContent = document.getElementById('toast-container')
  toastContent.innerHTML = ''
  toastContainer.classList.add('hidden')
}
