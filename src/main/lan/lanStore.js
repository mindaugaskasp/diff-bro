import { readFileSync, renameSync, writeFileSync } from 'fs'
import { defaultLanSettings, normalizeLanSettings } from './lanSettings'

export function readLanSettings(file, computerName) {
  try {
    return normalizeLanSettings(JSON.parse(readFileSync(file, 'utf8')), computerName)
  } catch {
    return defaultLanSettings(computerName)
  }
}

export function writeLanSettings(file, settings) {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(settings), { mode: 0o600 })
  renameSync(tmp, file)
}
