export const setThemeBasedOnSystemPreference = () => {
  const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)').matches

  if (prefersDarkScheme) {
    document.documentElement.setAttribute('data-theme', 'halloween')
  } else {
    document.documentElement.setAttribute('data-theme', 'cupcake')
  }
}
