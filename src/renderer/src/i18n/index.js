// The renderer's half of the catalogue, over the SAME messages the main process
// reads (src/shared/i18n). Installed on both renderer entries — the app window
// and the quick look-up launcher, which is its own Vue app and would otherwise
// stay English whatever the setting said.
//
// Where translation is allowed to be called from:
//   components / composables / stores / features → `$t` in a template, `t` here
//   utils/                                       → NEVER. utils/ is pure and
//     cannot import Vue, so it exports key IDs and the caller translates them.
//     That also keeps a locale change reactive: a string baked into a util at
//     module load would never update.
import { createI18n } from 'vue-i18n'
import { DEFAULT_LOCALE, allMessages, normalizeLocale, preferredLocale } from '../../../shared/i18n'
import { loadPersistedJson } from '../persist'

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: preferredLocale(loadPersistedJson('settings').locale, navigator.language),
  fallbackLocale: DEFAULT_LOCALE,
  messages: allMessages(),
  // A missing key renders its own id, which the pseudolocale run and
  // scripts/check-i18n.mjs both catch. Warnings here would only be console noise.
  missingWarn: false,
  fallbackWarn: false
})

/** @returns {string} the locale currently rendering, chosen or inherited */
export const activeLocale = () => i18n.global.locale.value

/** @param {string} key @param {object|number} [args] */
export const t = (key, args) => i18n.global.t(key, args)

/** @param {unknown} locale */
export function setLocale(locale) {
  i18n.global.locale.value = normalizeLocale(locale)
  document.documentElement.lang = i18n.global.locale.value
}
