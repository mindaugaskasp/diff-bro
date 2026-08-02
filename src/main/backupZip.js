// The container `diffbro backup <path>` writes. The payload is already sealed
// (configBackup.sealConfig) before it gets here, so this file only decides
// whether the destination is safe to write and wraps the blob in a zip.
//
// Pure enough to unit-test: everything it needs — the destination and the data
// directory it must not land inside — is passed in.

import { existsSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { zipSync, strToU8 } from 'fflate'

export const BACKUP_ENTRY = 'diffbro-backup.diffbroconf'

// An absolute `rel` means the two are on different Windows drives — not inside.
const isInside = (child, parent) => {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * Why the destination cannot be written, or null when it can. The path is
 * whatever a shell handed over, so every answer is given rather than thrown.
 * @param {string} target   absolute destination
 * @param {string} dataDir  the app's data directory
 * @returns {string|null}
 */
export function checkDestination(target, dataDir) {
  if (typeof target !== 'string' || !target.trim()) return 'backup needs a path to write to.'
  const abs = resolve(target)
  if (isInside(abs, resolve(dataDir))) {
    return 'That path is inside Diff Bro’s own data directory — pick somewhere else.'
  }
  if (existsSync(abs)) {
    if (statSync(abs).isDirectory()) return 'That path is a directory — name the file to write.'
    return 'That file already exists.'
  }
  const parent = dirname(abs)
  if (!existsSync(parent)) return `The folder ${parent} does not exist.`
  if (!statSync(parent).isDirectory()) return `${parent} is not a folder.`
  return null
}

/**
 * @param {string} target   absolute destination
 * @param {string} sealed   the passphrase-sealed envelope
 * @param {string} dataDir  the app's data directory
 * @returns {{ ok: boolean, path?: string, error?: string }}
 */
export function writeBackupZip(target, sealed, dataDir) {
  const problem = checkDestination(target, dataDir)
  if (problem) return { ok: false, error: problem }
  const abs = resolve(target)
  try {
    const zipped = zipSync({ [BACKUP_ENTRY]: strToU8(sealed) }, { level: 9 })
    writeFileSync(abs, zipped)
    return { ok: true, path: abs }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
