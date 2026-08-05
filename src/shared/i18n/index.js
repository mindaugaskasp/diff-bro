// The message catalogue, shared by BOTH processes: the renderer reads it
// through vue-i18n, the main process through the translator below. One file, so
// a menu label and the button that mirrors it cannot drift.
//
// Nothing here may import Node, Electron or Vue — this module is bundled into
// the renderer as well, and ESLint enforces it for src/shared/**.
import { createCoreContext, translate } from '@intlify/core'
// Import attributes, and every relative specifier below carries its extension:
// this module is reached from src/main/appData.js, which scripts/seed-worker.cjs
// loads under Node's OWN ESM loader with no bundler in front of it.
import en from './en.json' with { type: 'json' }
import enXA from './en-XA.json' with { type: 'json' }

export const DEFAULT_LOCALE = 'en'

/**
 * Shown in the Settings picker, each in its own language.
 *
 * `en-XA` is the GENERATED pseudolocale (scripts/pseudolocale.mjs), not a
 * translation: it is listed so the extraction can be exercised by hand and by
 * e2e. Real locales are added here as data once they exist.
 */
export const LOCALES = [
  { id: 'en', name: 'English' },
  { id: 'en-XA', name: 'Pseudolocale (testing)' }
]

const MESSAGES = { en, 'en-XA': enXA }

/** @returns {object} every locale's messages, keyed by locale id */
export const allMessages = () => MESSAGES

// hasOwnProperty, not `id in messages`: `constructor` and `toString` are `in`
// every object, and the result of this selects a message set.
const hasLocale = (messages, id) =>
  typeof id === 'string' && Object.prototype.hasOwnProperty.call(messages, id)

/** @param {unknown} id */
export const isLocale = (id) => hasLocale(MESSAGES, id)

/** @param {unknown} id @returns {string} a locale this build actually ships */
export const normalizeLocale = (id) => (isLocale(id) ? id : DEFAULT_LOCALE)

/**
 * Which locale to start in. The same rule in both processes: the user's own
 * choice wins, then the OS tag (`en-GB`, `lt-LT` — rarely one we ship
 * verbatim), then English.
 *
 * @param {unknown} chosen persisted setting
 * @param {unknown} systemTag app.getLocale() / navigator.language
 * @returns {string}
 */
export const preferredLocale = (chosen, systemTag) =>
  isLocale(chosen) ? chosen : normalizeLocale(systemTag)

/**
 * A bare `t(key, argsOrCount)` over the catalogue — no framework, so the main
 * process can use it for menus and native dialogs.
 *
 * @param {unknown} locale
 * @param {object} [messages] injected by tests; defaults to the shipped catalogue
 * @returns {(key: string, args?: object|number) => string}
 */
export function createTranslator(locale, messages = MESSAGES) {
  const context = createCoreContext({
    locale: hasLocale(messages, locale) ? locale : DEFAULT_LOCALE,
    fallbackLocale: DEFAULT_LOCALE,
    messages,
    missingWarn: false,
    fallbackWarn: false
  })
  return (key, args) =>
    String(args === undefined ? translate(context, key) : translate(context, key, args))
}
