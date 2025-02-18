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
          '*': {
            borderColor: '#C6C6C9',
          },
          '--rounded-box': '0.5rem',
          primary: '#002D5E', // <<- Swan Bubble
          'primary-content': '#E4F0FD',
          secondary: '#0070EA', // <<- User Bubble
          'secondary-content': '#E4F0FD',
          accent: '#7395B6',
          'accent-content': '#F1F5F9',
          neutral: '#0A131B',
          'neutral-content': '#E4ECF3',
          'base-100': '#fff',
          'base-200': '#F9F9FA',
          'base-300': '#F3F3F4', //'#DCDCDF',
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
