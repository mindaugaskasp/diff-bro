// The one place Diff Bro writes a file it did not create: the `$MERGED` path
// git handed it. Main holds that path from launch and the renderer sends only
// TEXT, so there is no argument through which it could name a file.
import { writeFileSync } from 'node:fs'

let pending = null

/**
 * The file the launcher watches. Comparing $MERGED's own size and timestamp was
 * not enough: a resolution that writes the same bytes back changes neither, and
 * `ls -l` only resolves to the minute — either way the launcher waited forever.
 * A sentinel appears exactly once, whatever the resolution turned out to be.
 */
export const doneSentinel = (merged) => `${merged}.diffbro-merge-done`

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
  try {
    writeFileSync(doneSentinel(merged), 'cancelled', 'utf8')
  } catch {
    // The launcher times out on its own; a sentinel it cannot read is not fatal.
  }
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
  try {
    writeFileSync(doneSentinel(path), 'written', 'utf8')
  } catch {
    // Falling back to the launcher's own timeout is better than failing a write
    // that already landed.
  }
  return { ok: true, path }
}
