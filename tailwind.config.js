/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'], // unclear whether there will be light/dark-mode
  content: ['./src/**/*.ts', '*.html'],
  plugins: [require('tailwindcss-animate'), require('daisyui')],
  daisyui: {
    //themes: ['halloween', 'cupcake'],
    themes: [
      {
        swan: {
          primary: '#002D5E', // <<- Swan Bubble
          'primary-content': '#E4F0FD',
          secondary: '#0070EA', // <<- User Bubble
          'secondary-content': '#cee1ff',
          accent: '#7395B6',
          'accent-content': '#000c00',
          neutral: '#131000',
          'neutral-content': '#c9c9c4',
          'base-100': '#fff',
          'base-200': '#F3F3F4',
          'base-300': '#DCDCDF',
          'base-content': '#141614',
          info: '#E4ECF3', // <<-- Chat Bubble and checkboxes
          'info-content': '#000715',
          success: '#008b00',
          'success-content': '#000700',
          warning: '#865d00',
          'warning-content': '#e6ddcf',
          error: '#DC1010',
          'error-content': '#160304',
        },
      },
    ],
  },
}
