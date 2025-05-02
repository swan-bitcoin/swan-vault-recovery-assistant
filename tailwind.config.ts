import animatePlugin from 'tailwindcss-animate'
import daisyUI from 'daisyui'
import type { Config } from 'tailwindcss'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'], // unclear whether there will be light/dark-mode
  content: ['./src/**/*.ts', '*.html'],
  plugins: [animatePlugin, daisyUI],
  daisyui: {
    themes: ['halloween', 'cupcake'],
  },
} satisfies Config
