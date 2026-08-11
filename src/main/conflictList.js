// The conflicted files git is walking, as a list the reader can choose from.
//
// Pure: git output and file contents arrive as arguments, so every refusal is
// testable without a repository. The paths in here NEVER reach the renderer —
// it addresses a row by its index and main resolves that back to a path, which
// is what keeps the merge write fenced (docs/security.md rule 7).
import { posix } from 'node:path'
import { isBinaryBuffer, MAX_MERGE_BYTES } from './mergeGuards'

// mergeGuards' rule, in counting form — so a row's number and the view's count
// of regions cannot disagree.
const OPENS = /^<<<<<<<(?: |$)/gm

/** How many regions the working copy still shows. */
export function conflictTally(text) {
  return String(text ?? '').match(OPENS)?.length ?? 0
}

/**
 * A path from git's own output, and nothing that could leave the repository or
 * read as an option. Deliberately narrower than git's rules.
 * @param {unknown} rel
 */
export function isRepoRelative(rel) {
  if (typeof rel !== 'string' || !rel) return false
  if (rel.startsWith('/') || rel.startsWith('-')) return false
  const parts = rel.replace(/\\/g, '/').split('/')
  return !parts.includes('..') && !parts.includes('')
}

const dirOf = (rel) => {
  const dir = posix.dirname(rel)
  return dir === '.' ? '' : dir
}

const blocked = (rel) => ({
  rel,
  name: posix.basename(rel),
  dir: dirOf(rel),
  tally: 0,
  state: 'blocked'
})

/**
 * One row. A file that cannot be opened as text — binary, past the ceiling,
 * unreadable, or with no markers left in it — is still a row, because hiding it
 * would make the list disagree with what git calls unmerged. It is `blocked`:
 * answerable whole-file from the index, never opened as text.
 *
 * @param {{rel: string, buffer: Buffer|null, size?: number}} file
 */
export function entryFor({ rel, buffer, size }) {
  if (!isRepoRelative(rel)) return null
  const bytes = size ?? buffer?.byteLength ?? 0
  if (!buffer || bytes > MAX_MERGE_BYTES || isBinaryBuffer(buffer)) return blocked(rel)
  const tally = conflictTally(buffer.toString('utf8'))
  if (!tally) return blocked(rel)
  return { rel, name: posix.basename(rel), dir: dirOf(rel), tally, state: 'open' }
}

/**
 * The list, in git's own order.
 * @param {object} source
 * @param {string[]} source.paths
 * @param {(rel: string) => {size: number, buffer: Buffer|null}} source.read
 *   sized before it is read, so the cap bounds what reaches memory
 * @param {Set<string>} [source.resolved]
 */
export function visibleEntries({ paths, read, resolved }) {
  const out = []
  for (const rel of paths) {
    const entry = entryFor({ rel, ...read(rel) })
    if (!entry) continue
    out.push(resolved?.has(rel) ? { ...entry, tally: 0, state: 'done' } : entry)
  }
  return out
}

/**
 * The row the renderer named, or null. Every shape that is not an index into
 * this list fails closed — an index is the renderer's ONLY say in which file
 * gets written.
 */
export function pickEntry(entries, index) {
  if (!Number.isInteger(index) || index < 0 || index >= entries.length) return null
  return entries[index]
}
