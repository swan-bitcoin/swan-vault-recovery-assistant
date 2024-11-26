export const closeToast = () => {
  const toastContainer = document.getElementById('toast-container')
  toastContainer.innerHTML = ''
  toastContainer.classList.add('hidden')
}
