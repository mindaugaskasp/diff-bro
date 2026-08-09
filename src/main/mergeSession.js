// The one place Diff Bro writes a file it did not create: the `$MERGED` path
// git handed it on the command line of a `git mergetool` run.
//
// The fence is the shape of the surface, not a check inside it. Main holds the
// path from launch; the renderer sends the resolved TEXT and nothing else, so
// there is no argument through which it could name a file. This mirrors
// clipboard:writeFile, which takes bytes and a display name and never a path.
//
// Nothing else in the app writes over a user's file, and nothing here writes
// unless a mergetool launch put a path in this module first.
import { writeFileSync } from 'node:fs'

let pending = null

/** Remembered from the launch argv, never from a message. */
export function beginMerge({ merged, local, remote }) {
  pending = { merged, local, remote }
  return pending
}

export function mergeInProgress() {
  return pending
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
  return { ok: true, path }
}
