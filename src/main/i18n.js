// The main process's half of the catalogue. Thin glue over src/shared/i18n so
// the translation logic stays testable without Electron.
//
// `t` keeps its conventional one-letter name rather than the naming rules'
// verb-or-noun phrase: it appears hundreds of times inside menu templates, and
// every reader of any i18n codebase already knows what it returns.
import { app } from 'electron'
import {
  DEFAULT_LOCALE,
  createTranslator,
  normalizeLocale,
  preferredLocale
} from '../shared/i18n/index.js'

let active = DEFAULT_LOCALE
let translate = createTranslator(active)

/** @returns {string} the locale main is currently rendering in */
export const currentLocale = () => active

/** @param {unknown} locale */
export function setLocale(locale) {
  active = normalizeLocale(locale)
  translate = createTranslator(active)
}

/**
 * The locale to start in: the user's choice if they have made one, otherwise
 * the OS locale, otherwise English.
 *
 * The persisted value is passed IN rather than read here. appData.js shows a
 * native folder dialog and so needs t(); if this module read settings back from
 * it, the two would import each other (check-structure.mjs catches it).
 *
 * @param {unknown} chosen the persisted `locale` setting
 * @returns {string}
 */
export function loadLocale(chosen) {
  setLocale(preferredLocale(chosen, app.getLocale()))
  return active
}

/** @param {string} key @param {object|number} [args] */
export const t = (key, args) => translate(key, args)
