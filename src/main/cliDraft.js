// How a draft typed in the CLI process reaches the app already running.
//
// NOT through the single-instance payload. Chromium's POSIX process singleton
// mis-sizes `additionalData`: a body holding whitespace and any character above
// U+00FF made the running app log `additional_data_size exceeds payload length`,
// never process the command, and get killed as unresponsive — the second
// instance then booted a duplicate on the same profile. A short ASCII path is
// small enough and plain enough to survive it; the draft goes in a file.
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const PREFIX = 'diffbro-draft-'
const FILE = 'draft.json'
// A snippet, not a corpus. The store's own guard is smaller still; this is only
// here so a corrupt or hostile file cannot be read into memory whole.
const MAX_BYTES = 8 * 1024 * 1024

/**
 * The draft on disk, and the path to tell the app about.
 * @param {object} draft
 * @returns {string}
 */
export function writeDraftFile(draft) {
  const dir = mkdtempSync(join(tmpdir(), PREFIX))
  const path = join(dir, FILE)
  // 0o600: the body is snippet plaintext, and it sits in a world-readable
  // directory for as long as the hand-off takes.
  writeFileSync(path, JSON.stringify(draft), { mode: 0o600 })
  return path
}

const isOurs = (path) =>
  typeof path === 'string' &&
  path.endsWith(FILE) &&
  (dirname(path).split(/[/\\]/).pop() ?? '').startsWith(PREFIX)

const shaped = (d) =>
  !!d &&
  typeof d.name === 'string' &&
  typeof d.language === 'string' &&
  typeof d.content === 'string' &&
  Array.isArray(d.tags)

/**
 * The draft, and the file gone. The path arrives from another process, so it is
 * untrusted: only our own staging shape is opened, and nothing else is deleted.
 * @param {string} path
 * @returns {object|null}
 */
export function readDraftFile(path) {
  if (!isOurs(path)) return null
  try {
    if (statSync(path).size > MAX_BYTES) return null
    const draft = JSON.parse(readFileSync(path, 'utf8'))
    return shaped(draft) ? draft : null
  } catch {
    return null
  } finally {
    discardDraftFile(path)
  }
}

/** Used when the hand-off never happened, so plaintext does not linger. */
export function discardDraftFile(path) {
  if (!isOurs(path)) return
  try {
    rmSync(dirname(path), { recursive: true, force: true })
  } catch {
    // Already gone, or never ours to remove.
  }
}

// A crash between writing and reading would leave a body in the temp dir until
// the OS cleaned it. Swept on launch — but only what is OLD, because a CLI
// running right now has a fresh one and this must not delete it out from under.
const STALE_MS = 10 * 60 * 1000

export function sweepDraftFiles(now = Date.now()) {
  try {
    for (const name of readdirSync(tmpdir())) {
      if (!name.startsWith(PREFIX)) continue
      const dir = join(tmpdir(), name)
      if (now - statSync(dir).mtimeMs > STALE_MS) rmSync(dir, { recursive: true, force: true })
    }
  } catch {
    // Best effort; a temp dir we cannot read is not a reason to fail a launch.
  }
}
