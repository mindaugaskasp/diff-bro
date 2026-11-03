// Which interpreters the user enabled. A main-only file outside the stores
// store:save accepts, so the renderer can't point a language at a program.
import { readFileSync, writeFileSync } from 'node:fs'

const LANGUAGES = ['php', 'python']
const OFF = { enabled: false, path: null, version: null }

function sanitizeLanguage(raw) {
  const path = typeof raw?.path === 'string' && raw.path ? raw.path : null
  return {
    enabled: raw?.enabled === true && path !== null,
    path,
    version: typeof raw?.version === 'string' ? raw.version : null
  }
}

export function sanitizeConfig(raw) {
  const languages = Object.fromEntries(
    LANGUAGES.map((language) => [language, sanitizeLanguage(raw?.languages?.[language])])
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

export const languageStatus = (config) => config.languages
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
