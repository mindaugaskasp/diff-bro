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

// Only what is genuinely unusable in a filename. Letters and marks in ANY
// script are kept: an ASCII-only slug turned "файл.txt" into "diffbro.txt" and
// mangled every accented name, which is the opposite of "the name you gave it".
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f<>:"/\\|?*]+/g
// Windows refuses these whatever the extension, and writing to one silently
// succeeds while the clipboard gets a path to a device.
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
// An extension is a hint to the OS about what to DO with a file. The renderer
// supplies the name, so the set is closed rather than sanitised — a staged
// `.command` pasted into a folder is one double-click from running.
const SAFE_EXT =
  /^(txt|md|json|yml|yaml|xml|csv|tsv|html|css|js|ts|jsx|tsx|py|rb|go|rs|java|kt|c|h|cpp|cs|php|sql|sh|toml|ini|conf|log|patch|diff|diffbro|mmd|svg|env|gitignore|properties|gradle|lock)$/i

/**
 * A flat, safe basename. A title is user text, so this makes a filename out of
 * it rather than trusting it as one.
 * @param {string} raw
 * @returns {string}
 */
export function safeName(raw) {
  const text = String(raw ?? '')
    .trim()
    .replace(UNSAFE, '-')
  const dot = text.lastIndexOf('.')
  const rawExt = dot > 0 && dot < text.length - 1 ? text.slice(dot + 1) : ''
  const ext = SAFE_EXT.test(rawExt) ? rawExt.toLowerCase() : ''
  const stem = (ext ? text.slice(0, dot) : text)
    .replace(/^[-.\s]+|[-.\s]+$/g, '')
    .slice(0, MAX_NAME_LENGTH)
  if (!stem || RESERVED.test(stem)) return `diffbro.${ext || 'txt'}`
  return `${stem}.${ext || 'txt'}`
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
