import { setThemeBasedOnSystemPreference } from './helpers'
import { commands } from './bindings'

const adjustMainContentHeight = () => {
  const footer = document.getElementById('footer')
  const mainContent = document.getElementById('main-content')

  if (footer && mainContent) {
    // Calculate the available height
    const availableHeight = window.innerHeight - footer.offsetHeight

    // Set the height of the main content
    mainContent.style.height = `${availableHeight}px`
  }
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

  const aboutLink = document.getElementById('about-link')
  aboutLink.addEventListener('click', async (event) => {
    event.preventDefault()
    await commands.createWindow('about', 'about.html', 'About Tempura', 800, 600)
  })
})
