export const setThemeBasedOnSystemPreference = () => {
  const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)').matches
  const themeInput = document.querySelector('.theme-controller') as HTMLInputElement

  if (prefersDarkScheme) {
    document.documentElement.setAttribute('data-theme', 'halloween')
    themeInput.checked = false
  } else {
    document.documentElement.setAttribute('data-theme', 'cupcake')
    themeInput.checked = true
  }
}
