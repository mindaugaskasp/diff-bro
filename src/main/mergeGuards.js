// What a mergetool run refuses before the renderer ever sees it. Pure, so both
// refusals are testable without a repository.

/**
 * The ceiling on anything a merge decodes — a stage read, a working copy
 * scanned for a tally. execFile's maxBuffer is 64 MB and would otherwise be the
 * only bound, with three decoded copies going over IPC into Monaco models while
 * the launcher waits on a decision.
 */
export const MAX_MERGE_BYTES = 32 * 1024 * 1024

/**
 * A NUL byte in the first 8 KB means this is not text — the same sniff
 * files.js uses. git calls the mergetool for a binary conflict as readily as a
 * text one, and decoding one as UTF-8 replaces every invalid byte, so writing
 * it back would destroy the file.
 */
export function isBinaryBuffer(buffer) {
  return buffer.subarray(0, 8192).includes(0)
}

// Seven characters at the start of a line, then end-of-line or a space.
const OPENS = /^<<<<<<<(?: |$)/m

/**
 * Whether the file git handed over actually holds a conflict. Without this a
 * file with none reads as "nothing left to decide", which enables Save and
 * writes it straight back — telling git a merge succeeded that never happened.
 */
export function hasConflictMarkers(text) {
  return OPENS.test(String(text ?? ''))
}
