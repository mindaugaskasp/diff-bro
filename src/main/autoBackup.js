// Rolling local backups of the two stores that hold work you cannot get back:
// snippets, and saved diffs that were kept rather than left to expire.
//
// The ciphertext is copied verbatim. Nothing is decrypted here and no key is
// touched, so a backup is exactly as readable as the vault it came from — and a
// restore is byte-for-byte the same entries, AAD bindings intact.

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const MIN_WINDOW_HOURS = 1
export const MAX_WINDOW_HOURS = 24
export const DEFAULT_WINDOW_HOURS = 6

// Several generations, not one. A backup taken on a schedule will eventually be
// taken AFTER the corruption it is meant to protect against; with a single slot
// that overwrite is the whole feature failing at the only moment it mattered.
export const KEEP_GENERATIONS = 5

const STAMP = /^diffbro-backup-(\d{8}T\d{6})\.json$/

/** @param {number} hours */
export const clampWindowHours = (hours) => {
  // Only a number that isn't one falls back; 0 is a value out of range, not a
  // missing setting, and clamping it is what "the offered range" means.
  const n = Number(hours)
  if (!Number.isFinite(n)) return DEFAULT_WINDOW_HOURS
  return Math.min(Math.max(Math.round(n), MIN_WINDOW_HOURS), MAX_WINDOW_HOURS)
}

/**
 * A sortable, human-readable name. Lexical order IS chronological order, which
 * is what lets rotation work off a plain directory listing.
 * @param {number} at  epoch ms
 */
export function backupName(at) {
  const d = new Date(at)
  const p = (n) => String(n).padStart(2, '0')
  const date = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`
  return `diffbro-backup-${date}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}.json`
}

/** @param {string} name @returns {number|null} epoch ms, or null if not ours */
export function backupTime(name) {
  const m = STAMP.exec(String(name ?? ''))
  if (!m) return null
  const [, s] = m
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`
  const at = Date.parse(iso)
  return Number.isFinite(at) ? at : null
}

/**
 * Whether enough time has passed. A save is what OFFERS a backup; the window is
 * what stops every save from taking one.
 * @param {number|null} lastAt
 * @param {number} windowHours
 * @param {number} now
 */
export const isDue = (lastAt, windowHours, now) =>
  !lastAt || now - lastAt >= clampWindowHours(windowHours) * 3600_000

/**
 * What a backup holds. Expiring diffs are deliberately left out: the reader
 * asked them to die, and restoring one months later would quietly undo that.
 * @param {object} vault    parsed vault store
 * @param {object} snippets parsed snippet store
 * @param {number} at
 */
export function backupPayload(vault, snippets, at) {
  const entries = (vault?.entries ?? []).filter((e) => e && e.expiresAt === null)
  return {
    format: 'diffbro-backup/1',
    at,
    vault: { entries },
    snippets: { tags: snippets?.tags ?? {}, entries: snippets?.entries ?? [] }
  }
}

/** @param {unknown} parsed @returns {boolean} */
export const isBackup = (parsed) =>
  !!parsed &&
  parsed.format === 'diffbro-backup/1' &&
  Array.isArray(parsed.vault?.entries) &&
  Array.isArray(parsed.snippets?.entries)

/**
 * The backups on disk, newest first.
 * @param {string} dir
 * @returns {Array<{ name: string, at: number, bytes: number }>}
 */
export function listBackups(dir) {
  let names
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    const at = backupTime(name)
    if (at === null) continue
    try {
      out.push({ name, at, bytes: statSync(join(dir, name)).size })
    } catch {
      continue
    }
  }
  return out.sort((a, b) => b.at - a.at)
}

/** @param {string} dir @param {number} [keep] @returns {number} removed */
export function rotate(dir, keep = KEEP_GENERATIONS) {
  const stale = listBackups(dir).slice(Math.max(0, keep))
  for (const { name } of stale) {
    try {
      rmSync(join(dir, name), { force: true })
    } catch {
      continue
    }
  }
  return stale.length
}

/**
 * @param {{ dir: string, vault: object, snippets: object, at?: number }} o
 * @returns {{ ok: boolean, name?: string, error?: string }}
 */
export function writeBackup({ dir, vault, snippets, at = Date.now() }) {
  const name = backupName(at)
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, name), JSON.stringify(backupPayload(vault, snippets, at)), {
      mode: 0o600
    })
  } catch (e) {
    return { ok: false, error: e.message }
  }
  rotate(dir)
  return { ok: true, name }
}

/**
 * @param {string} dir
 * @param {string} name
 * @returns {{ ok: boolean, vault?: object, snippets?: object, error?: string }}
 */
export function readBackup(dir, name) {
  if (backupTime(name) === null) return { ok: false, error: 'not-a-backup' }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(join(dir, name), 'utf8'))
  } catch {
    return { ok: false, error: 'unreadable' }
  }
  if (!isBackup(parsed)) return { ok: false, error: 'not-a-backup' }
  return { ok: true, vault: parsed.vault, snippets: parsed.snippets }
}
