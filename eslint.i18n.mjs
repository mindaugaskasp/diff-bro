// no-raw-text, in its own config so it can run over .vue with the i18n plugin
// without that plugin's parser settings reaching the rest of the lint run.
//
// It started as a ratchet at 193 while the extraction finished. It is now a
// GATE: scripts/check-raw-text.mjs holds the count at 0, so a hardcoded string
// in a template fails the build outright.
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
