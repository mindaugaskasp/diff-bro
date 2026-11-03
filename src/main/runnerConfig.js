// Which interpreters the user enabled. A main-only file outside the stores
// store:save accepts, so the renderer can't point a language at a program.
import { readFileSync, writeFileSync } from 'node:fs'
import { RUNNABLE_LANGUAGES, STOP_AFTER_MINUTES } from '../shared/snippetLanguages'

export const DEFAULT_STOP_AFTER_MINUTES = STOP_AFTER_MINUTES.fallback

const OFF = {
  enabled: false,
  path: null,
  version: null,
  stopAfterMinutes: DEFAULT_STOP_AFTER_MINUTES
}

export const isStopAfterMinutes = (value) =>
  Number.isInteger(value) && value >= 0 && value <= STOP_AFTER_MINUTES.max

function sanitizeLanguage(raw) {
  const path = typeof raw?.path === 'string' && raw.path ? raw.path : null
  return {
    enabled: raw?.enabled === true && path !== null,
    path,
    version: typeof raw?.version === 'string' ? raw.version : null,
    stopAfterMinutes: isStopAfterMinutes(raw?.stopAfterMinutes)
      ? raw.stopAfterMinutes
      : DEFAULT_STOP_AFTER_MINUTES
  }
}

/** 0 means no limit, as it does to startRun. */
export const timeoutMsOf = (language) => language.stopAfterMinutes * 60_000

export function sanitizeConfig(raw) {
  const languages = Object.fromEntries(
    RUNNABLE_LANGUAGES.map((language) => [language, sanitizeLanguage(raw?.languages?.[language])])
  )
  return { languages, confirmed: raw?.confirmed === true }
}

export function withLanguage(config, language, patch) {
  const current = config.languages[language] ?? OFF
  return {
    ...config,
    languages: { ...config.languages, [language]: { ...current, ...patch } }
  }
}

// What the renderer may see: never whether the warning was seen.
export const rendererStatus = (config, candidates = {}) =>
  Object.fromEntries(
    Object.entries(config.languages).map(([language, status]) => [
      language,
      { ...status, candidates: candidates[language] ?? [] }
    ])
  )
export const isEnabled = (config, language) => config.languages[language]?.enabled === true

export function readConfig(file) {
  try {
    return sanitizeConfig(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return sanitizeConfig(null)
  }
}

export function writeConfig(file, config) {
  writeFileSync(file, JSON.stringify(config, null, 2))
}
