// Electron glue over autoBackup.js. Thin: the rotation, the window and the
// payload shape are the tested core.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import { dataFile, getDataDir, readSettings } from './appData'
import {
  DEFAULT_WINDOW_HOURS,
  isDue,
  listBackups,
  pruneOlderThan,
  readBackup,
  writeBackup
} from './autoBackup'

export const backupDir = () => join(getDataDir(), 'backups')

const readStoreFile = (name) => {
  try {
    return JSON.parse(readFileSync(dataFile(`${name}.json`), 'utf8'))
  } catch {
    return null
  }
}

// Held in memory rather than on disk: the window is a rate limit, and a missed
// backup after a restart is one extra backup, not a lost one.
let lastAt = null

/**
 * Take a backup if the window has elapsed. Called after a save, so backups
 * track real changes instead of a clock ticking over an idle app.
 * @param {number} [now]
 */
export function backupIfDue(now = Date.now()) {
  const settings = readSettings()
  if (settings.autoBackup === false) return { skipped: 'off' }
  const hours = settings.autoBackupHours ?? DEFAULT_WINDOW_HOURS
  if (!isDue(lastAt, hours, now)) return { skipped: 'not-due' }

  const vault = readStoreFile('vault')
  const snippets = readStoreFile('snippets')
  if (!vault && !snippets) return { skipped: 'nothing-to-back-up' }

  const res = writeBackup({ dir: backupDir(), vault, snippets, at: now })
  if (res.ok) lastAt = now
  return res
}

// The only ages the pane offers. An allow-list, not a range: the renderer names
// a choice, never an arbitrary number, and never a file.
export const PRUNE_DAYS = [7, 14]

export function registerBackupIpc() {
  ipcMain.handle('backup:list', () => listBackups(backupDir()))

  // Deletes ONLY backups, ONLY in the backup folder, ONLY past the age given —
  // and the age must be one this app offers. The renderer cannot name a file.
  ipcMain.handle('backup:prune', (e, days) => {
    if (!PRUNE_DAYS.includes(days)) return { ok: false, error: 'bad-request' }
    return { ok: true, ...pruneOlderThan(backupDir(), days) }
  })

  // Restore writes the store files directly and the renderer reloads from them;
  // nothing is decrypted on either side of this, so a restore cannot fail
  // halfway through with one store from each generation.
  ipcMain.handle('backup:restore', (e, name) => {
    if (typeof name !== 'string') return { ok: false, error: 'bad-request' }
    const res = readBackup(backupDir(), name)
    if (!res.ok) return res
    try {
      writeFileSync(dataFile('vault.json'), JSON.stringify(res.vault))
      writeFileSync(dataFile('snippets.json'), JSON.stringify(res.snippets))
    } catch (err) {
      return { ok: false, error: err.message }
    }
    return { ok: true, diffs: res.vault.entries.length, snippets: res.snippets.entries.length }
  })
}
