/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'], // unclear whether there will be light/dark-mode
  content: ['./src/**/*.ts', '*.html'],
  plugins: [require('tailwindcss-animate'), require('daisyui')],
  daisyui: {
    themes: ['halloween', 'cupcake'],
  },
}
