// In userData: consent is per install and must not travel with a moved or restored data folder.
import { appendFileSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'

export const ACTIVITY_SHOWN = 200
const ACTIVITY_TRIM_BYTES = 256 * 1024

export const claudePaths = (userData) => ({
  grant: join(userData, 'claude-grant.json'),
  activity: join(userData, 'claude-activity.jsonl'),
  inbox: join(userData, 'claude-inbox')
})

export function readGrantRecord(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

export function writeGrantRecord(path, record) {
  writeFileSync(`${path}.tmp`, JSON.stringify(record), { mode: 0o600 })
  renameSync(`${path}.tmp`, path)
}

/** @param {{ at: number, tool: string, item: string|null }} entry */
export function appendActivity(path, entry) {
  appendFileSync(path, `${JSON.stringify(entry)}\n`, { mode: 0o600 })
}

const parsedLines = (text) =>
  text
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })

/** Newest first. Rewrites the log down to what is shown once it grows past the trim size. */
export function readActivity(path) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return []
  }
  const kept = parsedLines(text).slice(-ACTIVITY_SHOWN)
  if (statSync(path).size > ACTIVITY_TRIM_BYTES) {
    writeFileSync(path, kept.map((e) => `${JSON.stringify(e)}\n`).join(''), { mode: 0o600 })
  }
  return kept.reverse()
}

export const clearActivity = (path) => rmSync(path, { force: true })
