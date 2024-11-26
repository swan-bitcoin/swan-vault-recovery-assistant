export const RecoveryToast = () => {
  return `
    <div class="toast toast-end z-50">
      <div class="alert alert-info relative">
        <button id="close-toast-btn" class="btn btn-sm btn-circle btn-ghost absolute top-1 right-1">✕</button>
        <div class="flex items-center">
          <span>You can recover your wallet now.</span>
          <button id="begin-recovery-btn" class="btn btn-link px-1">
            Start Recovery
          </button>
        </div>
      </div>
    </div>
  `
}
