import { setThemeBasedOnSystemPreference } from './helpers'

const adjustMainContentHeight = () => {
  const footer = document.getElementById('footer')
  const mainContent = document.getElementById('main-content')

  // Calculate the available height
  const availableHeight = window.innerHeight - footer.offsetHeight

  // Set the height of the main content
  mainContent.style.height = `${availableHeight}px`
}

// Adjust on load and when the window is resized
window.addEventListener('load', adjustMainContentHeight)
window.addEventListener('resize', adjustMainContentHeight)

document.addEventListener('DOMContentLoaded', () => {
  setThemeBasedOnSystemPreference()

  // Watch for changes to the system's color scheme preference
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (e.matches) {
      document.documentElement.setAttribute('data-theme', 'halloween')
    } else {
      document.documentElement.setAttribute('data-theme', 'cupcake')
    }
  })
})
