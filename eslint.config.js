import globals from 'globals'
import pluginJs from '@eslint/js'
import tseslint from 'typescript-eslint'

export default [
  { files: ['**/*.{js,mjs,cjs,ts}'] },
  { languageOptions: { globals: globals.browser } },
  {
    ignores: ['node_modules', 'src/bindings.ts', 'src-tauri', 'tailwind.config.js', 'test', 'scripts'],
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
]
