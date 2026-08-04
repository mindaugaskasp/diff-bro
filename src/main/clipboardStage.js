// Staging for "Copy as file". A file on the clipboard is a PATH, so the bytes
// have to survive on disk until the paste happens — which for a snippet means
// plaintext outside the vault for as long as the staged copy lives.
//
// That is the whole reason this module exists separately: the window is real, so
// it is bounded in one place. 0o700, pruned by age, and swept on quit AND on
// launch (a crash skips the first, and a snippet surviving a reboot in the temp
// directory is the failure that actually matters).
import { app } from 'electron'
import { mkdir, readdir, rm, stat, writeFile } from 'fs/promises'
import { join } from 'path'

export const STAGE_TTL_MS = 30 * 60 * 1000
const MAX_STAGED_BYTES = 64 * 1024 * 1024
const MAX_NAME_LENGTH = 120

const stageDir = () => join(app.getPath('temp'), 'diffbro-clipboard')

/**
 * A flat, safe basename. The same slug rule keyFileBasename uses: a title of
 * `../../.ssh/config` has to become a filename, not a traversal.
 * @param {string} raw
 * @returns {string}
 */
export function safeName(raw) {
  const text = String(raw ?? '').trim()
  const dot = text.lastIndexOf('.')
  const hasExt = dot > 0 && dot < text.length - 1 && dot > text.length - 12
  const slug = (s) => s.replace(/[^\w.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '')
  const stem = slug(hasExt ? text.slice(0, dot) : text).slice(0, MAX_NAME_LENGTH)
  const ext = hasExt ? slug(text.slice(dot + 1)).slice(0, 12) : ''
  if (!stem) return ext ? `diffbro.${ext}` : 'diffbro.txt'
  return ext ? `${stem}.${ext}` : stem
}

async function prune(dir) {
  const cutoff = Date.now() - STAGE_TTL_MS
  let names
  try {
    names = await readdir(dir)
  } catch {
    return
  }
  await Promise.all(
    names.map(async (name) => {
      const path = join(dir, name)
      try {
        if ((await stat(path)).mtimeMs < cutoff) await rm(path, { force: true, recursive: true })
      } catch {
        /* a file that vanished under us needs no pruning */
      }
    })
  )
}

/**
 * Write bytes to a staged file and return its path. Every staged copy is put in
 * its own subdirectory so two snippets with the same title cannot collide, and
 * so the name the user sees when pasting is the name they gave it.
 * @param {{ name: string, bytes: Buffer | Uint8Array | string }} item
 * @returns {Promise<{ ok: true, path: string } | { error: string }>}
 */
export async function stageFile({ name, bytes } = {}) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? '')
  if (!buffer.length) return { error: 'empty' }
  if (buffer.length > MAX_STAGED_BYTES) return { error: 'too-large' }

  const dir = stageDir()
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await prune(dir)

  const slot = join(dir, `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
  await mkdir(slot, { mode: 0o700 })
  const path = join(slot, safeName(name))
  await writeFile(path, buffer, { mode: 0o600 })
  return { ok: true, path }
}

/** Empty the staging directory. Called on launch and again on quit. */
export async function sweepStage() {
  await rm(stageDir(), { force: true, recursive: true }).catch(() => {})
}
