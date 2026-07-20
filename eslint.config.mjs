import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default [
  { ignores: ['build/**', 'dist/**', 'node_modules/**'] },

  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  prettier,

  {
    rules: {
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'smart'],
      // Security: these must never appear anywhere in this codebase.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'vue/no-v-html': 'error',
      // Prettier owns formatting; keep vue templates out of fights with it.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off'
    }
  },

  // Main + preload: Node process, Electron allowed.
  {
    files: ['src/main/**', 'src/preload/**', 'electron.vite.config.mjs', 'scripts/**'],
    languageOptions: { globals: { ...globals.node } }
  },

  // Renderer: browser only. It must never touch Node or Electron directly —
  // everything goes through the window.api preload surface.
  {
    files: ['src/renderer/**'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'electron',
              message: 'Renderer code must use window.api (preload), never electron directly.'
            }
          ],
          patterns: [
            {
              group: [
                'node:*',
                'fs',
                'fs/*',
                'path',
                'crypto',
                'child_process',
                'os',
                'net',
                'http',
                'https'
              ],
              message: 'Node built-ins are main-process only. Add an IPC handler instead.'
            }
          ]
        }
      ]
    }
  },

  // Tests: Node + browser globals (jsdom), vitest's are imported explicitly.
  {
    files: ['tests/**', 'vitest.config.mjs', 'eslint.config.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  }
]
