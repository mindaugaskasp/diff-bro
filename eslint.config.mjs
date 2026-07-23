import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'
import sonarjs from 'eslint-plugin-sonarjs'
import globals from 'globals'

export default [
  { ignores: ['build/**', 'dist/**', 'node_modules/**'] },

  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  prettier,

  // Duplication / cognitive-load detection. Only the structural rules are on:
  // the plugin's full recommended set is opinionated far beyond what this
  // codebase wants, and lint-time only — nothing here ships in the app.
  {
    plugins: { sonarjs },
    rules: {
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-all-duplicated-branches': 'error',
      'sonarjs/no-identical-conditions': 'error',
      'sonarjs/no-redundant-boolean': 'error',
      'sonarjs/no-collapsible-if': 'error',
      'sonarjs/prefer-immediate-return': 'error',
      'sonarjs/cognitive-complexity': ['error', 15]
    }
  },

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
      // Function shape. A function that trips these is usually two functions,
      // and a call with five positional arguments wants an options object.
      complexity: ['error', 10],
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      // Prettier owns formatting; keep vue templates out of fights with it.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off'
    }
  },

  // Structure guard for components: a .vue file past this length is doing too
  // much. Split the markup into child components and move logic into
  // composables/ or utils/ — raising the cap is not the fix.
  {
    files: ['**/*.vue'],
    rules: {
      'max-lines': ['error', { max: 250, skipBlankLines: false, skipComments: false }],
      // Sharper than the file cap: a 200-line template hiding behind a 20-line
      // script is still a component doing too much. (CSS can't be capped here —
      // it lives in components/styles/<Name>.css and never in the SFC.)
      'vue/max-lines-per-block': ['error', { template: 120, script: 100, skipBlankLines: false }],
      // Style blocks must be `src`-linked, never inline.
      'vue/block-lang': ['error', { style: { allowNoLang: true } }],
      // Templates are stringly-typed: without these, a renamed component or
      // property silently renders nothing instead of failing.
      'vue/no-undef-components': ['error', { ignorePatterns: ['component'] }],
      'vue/no-undef-properties': 'error',
      'vue/no-unused-refs': 'error',
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
      'vue/custom-event-name-casing': ['error', 'camelCase'],
      'vue/define-props-declaration': ['error', 'runtime'],
      'vue/require-explicit-emits': 'error'
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

  // Renderer layering. utils/ is the pure core — no framework, no stores, no
  // components — which is what keeps it unit-testable without mounting
  // anything (see the testing rules in CLAUDE.md). Composables may use Vue and
  // stores, but never reach back into components.
  {
    files: ['src/renderer/src/utils/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['vue', '*/stores/*', '../stores/*', '*/components/*', '../components/*'],
              message:
                'utils/ must stay pure: no Vue, stores or components. Put stateful logic in composables/.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['src/renderer/src/composables/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['*.vue', '*/components/*', '../components/*'],
              message: 'Composables are used BY components, never the other way around.'
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
  },

  // E2E: Playwright driver code runs in Node and launches the built Electron
  // app; `test`/`expect` are imported. Page-evaluated callbacks reference
  // browser globals, so allow both. A fixture that depends on no other fixture
  // takes Playwright's mandatory `{}` first argument — that empty pattern is the
  // framework idiom, not a mistake.
  {
    files: ['e2e/**', 'playwright.config.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-empty-pattern': 'off' }
  }
]
