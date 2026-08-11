// The one place Diff Bro writes a file it did not create: the `$MERGED` path
// git handed it. Main holds that path from launch and the renderer sends only
// TEXT, so there is no argument through which it could name a file.
import { writeFileSync } from 'node:fs'

let pending = null

// `git mergetool` walks the conflicted files one at a time, in separate
// launches. Only main survives between them, so the walk is remembered here.
//
// Counting the files main has SEEN, rather than what git still calls
// unmerged: a file the reader declined stays unmerged, and a tool invoked
// directly never stages anything, so the remaining count is not a position.
let walk = { total: 0, seen: new Set() }

/**
 * Where this file sits in the walk. A file arriving twice means a new walk over
 * the same conflicts.
 * @param {number} unmerged how many files git still calls conflicted
 * @param {string} merged the file this launch is for
 */
export function walkPosition(unmerged, merged) {
  if (!walk.total || walk.seen.has(merged)) walk = { total: unmerged || 1, seen: new Set() }
  walk.seen.add(merged)
  return { position: walk.seen.size, total: Math.max(walk.total, walk.seen.size) }
}

/** A fresh walk next time — used when a run ends. */
export function walkReset() {
  walk = { total: 0, seen: new Set() }
}

/**
 * The file the launcher watches. Comparing $MERGED's own size and timestamp was
 * not enough: a resolution that writes the same bytes back changes neither, and
 * `ls -l` only resolves to the minute — either way the launcher waited forever.
 * A sentinel appears exactly once, whatever the resolution turned out to be.
 */
export const doneSentinel = (merged) => `${merged}.diffbro-merge-done`

/**
 * Release the launcher. Exported because a file the reader already answered
 * OUT OF ORDER gets a launch of its own later, and that launch has no session
 * to spend — it is answered before any window is shown.
 * @param {'written'|'cancelled'} verdict
 */
export function releaseLauncher(merged, verdict) {
  try {
    writeFileSync(doneSentinel(merged), verdict, 'utf8')
    return true
  } catch {
    // The launcher times out on its own; a sentinel it cannot read is not fatal.
    return false
  }
}

/** Remembered from the launch argv, never from a message. */
export function beginMerge({ merged, local, remote }) {
  pending = { merged, local, remote }
  return pending
}

export function mergeInProgress() {
  return pending
}

/**
 * The reader declined. The session is spent — an abandoned launch must not leave
 * a path armed for the life of the process — and the launcher is released so
 * `git mergetool` stops waiting on a decision that is not coming.
 */
export function cancelMerge() {
  if (!pending) return { ok: false }
  const { merged } = pending
  pending = null
  releaseLauncher(merged, 'cancelled')
  return { ok: true }
}

export function endMerge() {
  pending = null
}

/**
 * Write the resolved text to the path this session was launched with.
 * @param {unknown} text  the composed file — the renderer's only say in this
 * @returns {{ok: true, path: string}|{ok: false, error: string}}
 */
export function writeMerged(text) {
  if (!pending) return { ok: false, error: 'no-merge' }
  if (typeof text !== 'string') return { ok: false, error: 'not-text' }
  try {
    writeFileSync(pending.merged, text, 'utf8')
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) }
  }
  const path = pending.merged
  endMerge()
  // Falling back to the launcher's own timeout is better than failing a write
  // that already landed.
  releaseLauncher(path, 'written')
  return { ok: true, path }
}
