// The no-raw-text ratchet, kept OUT of eslint.config.mjs on purpose.
//
// 193 raw strings still sit in templates — mostly `cond ? 'A' : 'B'` ternaries,
// which the extraction pass missed systematically. Wiring this into the main
// config would fail the build; leaving it out entirely would let the number grow
// back. So it runs as its own check against a committed count, exactly like
// scripts/lib/legacySize.mjs: the number may fall and never rise.
import pluginVue from 'eslint-plugin-vue'
import vueI18n from '@intlify/eslint-plugin-vue-i18n'

export default [
  { ignores: ['build/**', 'node_modules/**', '.claude/**'] },
  ...pluginVue.configs['flat/base'],
  ...vueI18n.configs['flat/base'],
  {
    files: ['src/renderer/src/**/*.vue'],
    settings: { 'vue-i18n': { localeDir: './src/shared/i18n/*.json' } },
    rules: {
      '@intlify/vue-i18n/no-raw-text': [
        'error',
        {
          // Structural or non-prose nodes: a keyboard chord, a code sample and a
          // brand name are not copy.
          ignoreNodes: ['style', 'pre', 'code', 'kbd'],
          ignorePattern: '^[\\s\\d\\p{P}\\p{S}]*$',
          ignoreText: ['·', '—', '×', 'Diff Bro']
        }
      ]
    }
  }
]
