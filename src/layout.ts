const adjustMainContentHeight = () => {
  const navbar = document.getElementById('navbar')
  const footer = document.getElementById('footer')
  const mainContent = document.getElementById('main-content')

  // Calculate the available height
  const availableHeight = window.innerHeight - navbar.offsetHeight - footer.offsetHeight

  // Set the height of the main content
  mainContent.style.height = `${availableHeight}px`
}

// Adjust on load and when the window is resized
window.addEventListener('load', adjustMainContentHeight)
window.addEventListener('resize', adjustMainContentHeight)
