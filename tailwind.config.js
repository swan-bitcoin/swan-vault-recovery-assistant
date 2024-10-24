/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'], // unclear whether there will be light/dark-mode
  content: ['./src/**/*.ts', 'index.html'],
  plugins: [require('tailwindcss-animate'), require('daisyui')],
  daisyui: {
    themes: ['halloween', 'dark', 'business', 'bumblebee', 'coffee', 'retro'],
  },
}
