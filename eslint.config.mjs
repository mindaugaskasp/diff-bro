import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'
import sonarjs from 'eslint-plugin-sonarjs'
import globals from 'globals'
import { SIZE_EXEMPT, legacyConfigBlocks } from './scripts/lib/legacySize.mjs'
import { featureNames } from './scripts/lib/featureDirs.mjs'

// The renderer/main fence (hard rule 3). Shared rather than repeated because
// no-restricted-imports is REPLACED, not merged, by a later block — a config
// that re-sets it for a subdirectory silently drops this ban for those files.
const NO_NODE_IN_RENDERER = {
  paths: [
    {
      name: 'electron',
      message: 'Renderer code must use window.api (preload), never electron directly.'
    }
  ],
  patterns: [
    {
      // A slice is reachable only through its index.js, from anywhere outside
      // it. No extglob: ESLint matches these gitignore-style, where `!(index)*`
      // is not syntax and silently matches NOTHING — which is how the first
      // version of this rule passed a planted violation. Negation is the
      // supported way to carve out the index.
      group: ['**/features/*/**', '!**/features/*/index.js'],
      message:
        "A slice's internals are private. Import the slice (…/features/<name>), or lift the shared part into utils/ or components/."
    },
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

export default [
  // `.claude/` holds agent worktrees — whole checkouts of this repo, nested
  // inside it. Linting them makes `npm run check` report someone else's
  // half-finished code as this tree's failure.
  { ignores: ['build/**', 'dist/**', 'node_modules/**', '.claude/**'] },

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
      // A template expression is evaluated against the COMPONENT, not global
      // scope, and Vue's allowed-globals list has no `window`. ESLint cannot see
      // that on its own: renderer files are given browser globals, so
      // vue/no-undef-properties considers `window` legitimately defined and says
      // nothing — which is how `@click="run(window.api.cliInstall)"` shipped and
      // threw on every click.
      'vue/no-restricted-syntax': [
        'error',
        {
          selector:
            'MemberExpression > Identifier.object[name=/^(window|document|globalThis|navigator|localStorage)$/]',
          message:
            'A template cannot reach browser globals — Vue resolves identifiers against the component. Expose it from <script setup> instead.'
        }
      ],
      // Naming. All three already hold by hand across the tree; they are set so
      // the first slip fails a build instead of waiting for review.
      camelcase: ['error', { properties: 'never' }],
      // Only the `new lowercase()` half: capIsNew would fail 194 SCREAMING_CASE
      // test factories (FILE(), SURFACE()), which are not constructors and not
      // wrong. The exceptions are Vite `?worker` default imports — constructors
      // that arrive lowercase from the module, not names we choose.
      'new-cap': [
        'error',
        {
          capIsNew: false,
          newIsCapExceptions: ['jsonWorker', 'cssWorker', 'htmlWorker', 'tsWorker', 'editorWorker']
        }
      ],
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

  // Size caps for shipped .js, matching the 250 components already live under.
  // Files over them today carry an exact entry in LEGACY_SIZE — permission for
  // what exists, not one line more. Beat a cap and delete the entry;
  // check-structure.mjs fails on one left behind.
  {
    files: ['src/**/*.js'],
    rules: {
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: false, skipComments: false }],
      'max-lines': ['error', { max: 250, skipBlankLines: false, skipComments: false }]
    }
  },
  ...legacyConfigBlocks(),
  // A cap on a declaration list fires when you add an icon or a typedef, and
  // neither file has logic to separate.
  { files: SIZE_EXEMPT, rules: { 'max-lines': 'off' } },

  // Shipped code only. Tests reach into store internals (`store._shoot`) and
  // e2e namespaces its page-evaluated probes on `window.__…`; both are correct
  // where they are, and neither is naming this app's own surface. A Pinia
  // action prefixed `_` survives the rule anyway — it is an object property,
  // which no-underscore-dangle does not check.
  {
    files: ['src/**'],
    rules: {
      'no-underscore-dangle': ['error', { allowAfterThis: true, allowFunctionParams: true }]
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

  // src/shared is bundled into BOTH processes, so it lives under the renderer's
  // restrictions rather than main's — a Node import here would reach the
  // renderer without tripping the rule below, which only looks at src/renderer.
  // No Vue either: the main process reads this code too.
  {
    files: ['src/shared/**'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: NO_NODE_IN_RENDERER.paths,
          patterns: [
            ...NO_NODE_IN_RENDERER.patterns,
            {
              group: ['vue', 'pinia', '*/stores/*', '*/components/*', '**/features/**'],
              message:
                'src/shared is imported by the main process too — it must stay free of Vue, Pinia and renderer state.'
            }
          ]
        }
      ]
    }
  },

  // Renderer: browser only. It must never touch Node or Electron directly —
  // everything goes through the window.api preload surface.
  {
    files: ['src/renderer/**'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'no-restricted-imports': ['error', NO_NODE_IN_RENDERER]
    }
  },

  // Renderer layering. utils/ is the pure core — no framework, no stores, no
  // components — which is what keeps it unit-testable without mounting
  // anything (see the testing rules in docs/standards.md). Composables may use Vue and
  // stores, but never reach back into components.
  {
    files: ['src/renderer/src/utils/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: NO_NODE_IN_RENDERER.paths,
          patterns: [
            ...NO_NODE_IN_RENDERER.patterns,
            {
              group: [
                'vue',
                '*/stores/*',
                '../stores/*',
                '*/components/*',
                '../components/*',
                '**/features/**'
              ],
              message:
                'utils/ must stay pure: no Vue, stores, components or feature slices. Put stateful logic in composables/.'
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
          paths: NO_NODE_IN_RENDERER.paths,
          patterns: [
            ...NO_NODE_IN_RENDERER.patterns,
            {
              group: ['*.vue', '*/components/*', '../components/*'],
              message: 'Composables are used BY components, never the other way around.'
            }
          ]
        }
      ]
    }
  },

  // A vertical slice owns its state, its UI and its commands, and is reachable
  // only through its index.js — the renderer-wide rule above carries that ban,
  // and a slice's own files use bare relative paths, so nothing special is
  // needed here. The core is different: it may not import a slice AT ALL, which
  // is the direction check-structure.mjs catches as a cycle.
  // From OUTSIDE a slice the pattern above is enough, because the specifier
  // carries `features/`. From INSIDE one it does not: a sibling is reached as
  // `../imageExport/imageExportStore`, which has no `features/` segment and so
  // matched nothing — and `../*/*` cannot be used instead, since `*` also
  // matches `..` and would ban the core. Naming the siblings is the only form
  // that separates them; the names are read from disk, so a new slice is
  // covered the moment it exists.
  ...featureNames().map((self) => ({
    files: [`src/renderer/src/features/${self}/**`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: NO_NODE_IN_RENDERER.paths,
          patterns: [
            ...NO_NODE_IN_RENDERER.patterns,
            {
              group: featureNames()
                .filter((other) => other !== self)
                .flatMap((other) => [`**/${other}/*`, `**/${other}/*/**`]),
              message:
                "Another slice's internals are private. Import the slice itself (…/features/<name>), or lift the shared part into utils/ or components/."
            }
          ]
        }
      ]
    }
  })),

  {
    files: ['src/renderer/src/stores/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: NO_NODE_IN_RENDERER.paths,
          patterns: [
            ...NO_NODE_IN_RENDERER.patterns,
            {
              group: ['**/features/**'],
              message:
                'The core cannot depend on a feature. Invert it: the slice reads the core, and anything cross-cutting is a command in utils/commands.js.'
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
