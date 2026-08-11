// Custody of the conflict list for one `git mergetool` run.
//
// git walks the conflicted files one launch at a time and only MAIN survives
// between them, so the list, the repository root and what has already been
// answered are remembered here. The renderer addresses a file by its INDEX into
// this list and never by name: main resolves the index back to a path, which is
// what keeps a merge write fenced (docs/security.md rule 7).
import { readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { pickEntry, isRepoRelative, visibleEntries } from './conflictList'
import {
  readStageArgs,
  repoRootArgs,
  runGitBytesIn,
  runGitIn,
  splitNulPaths,
  unmergedArgs
} from './gitRepo'
import { stagesFor } from './mergeInputs'
import { isBinaryBuffer, MAX_MERGE_BYTES } from './mergeGuards'

let session = null

// Through realpath first: on macOS a repo under /var is reported by git as
// /private/var, and relative() between the two forms yields a path full of `..`
// that the fence then rejects.
const real = (path) => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/**
 * The repository holding a mergetool's `$MERGED`, and where that file sits in
 * it. Null when git will not claim it — a tool invoked by hand, a file outside
 * any repo — which leaves the single-file path exactly as it was.
 */
export async function locate(merged) {
  const res = await runGitIn(repoRootArgs(), dirname(merged))
  const root = res.ok ? res.stdout.trim() : ''
  if (!root) return null
  const rel = relative(real(root), real(merged)).split(sep).join('/')
  return isRepoRelative(rel) ? { root, rel } : null
}

// Sized BEFORE it is read: the cap is there to stop a huge conflicted file
// being pulled into main, and checking it on the resulting Buffer would already
// have pulled it. `size` is what entryFor classifies on.
const readAt = (root) => (rel) => {
  try {
    const path = join(root, rel)
    const size = statSync(path).size
    return { size, buffer: size > MAX_MERGE_BYTES ? null : readFileSync(path) }
  } catch {
    return { size: 0, buffer: null }
  }
}

const unmergedPaths = async (root) => {
  const res = await runGitIn(unmergedArgs(), root)
  return res.ok ? splitNulPaths(res.stdout).filter(isRepoRelative) : []
}

/**
 * Build (or rebuild) the list for a repository. Called on every launch, so a
 * file answered outside the app between two launches drops out on its own.
 * @param {string} root  the repository root, computed in main
 */
export async function openConflictSession(root) {
  const resolved = session?.root === root ? session.resolved : new Set()
  const paths = await unmergedPaths(root)
  session = {
    root,
    resolved,
    openRel: null,
    entries: visibleEntries({ paths, read: readAt(root), resolved })
  }
  return session.entries.length
}

export function endConflictSession() {
  session = null
}

/** What the renderer is allowed to see: no paths, only what a row displays. */
export function conflictRows() {
  return (session?.entries ?? []).map(({ name, dir, tally, state }) => ({
    name,
    dir,
    tally,
    state
  }))
}

/** Where a path sits in the list, so the launch's own file can be marked. */
export function indexOfRel(rel) {
  return (session?.entries ?? []).findIndex((entry) => entry.rel === rel)
}

export function isResolvedRel(rel) {
  return !!session?.resolved.has(rel)
}

/**
 * Re-verified at USE time, never at list time: a file can stop being unmerged
 * between the dialog opening and a row being clicked, and a stale row must fail
 * closed rather than write over something git no longer calls conflicted.
 */
async function verifiedEntry(index) {
  const entry = pickEntry(session?.entries ?? [], index)
  if (!entry) return null
  const paths = await unmergedPaths(session.root)
  return paths.includes(entry.rel) ? entry : null
}

// Bytes, never a decoded string: a binary row promises "pick a side", and a
// side that came back through UTF-8 would be written back corrupted.
const stageBytes = async (root, rel, stage) => {
  const res = await runGitBytesIn(readStageArgs(stage, rel), root)
  if (!res.ok || res.stdout.byteLength > MAX_MERGE_BYTES) return null
  return res.stdout
}

function markResolved(entry) {
  session.resolved.add(entry.rel)
  const row = session.entries.find((e) => e.rel === entry.rel)
  if (row) Object.assign(row, { state: 'done', tally: 0 })
}

/**
 * The file THIS launch was given, once its own fence has written it. Marked
 * here too so the list agrees with what happened, and so a re-launch for it
 * short-circuits like any other answered row.
 */
export function noteResolved(rel) {
  if (session && rel) markResolved({ rel })
}

/**
 * Answer a whole file from the index without opening it — the row's Ours /
 * Theirs. Stage 2 is ours, 3 theirs.
 * @param {{index: number, side: 'ours'|'theirs'}} choice
 */
export async function takeSideAt({ index, side }) {
  const entry = await verifiedEntry(index)
  if (!entry) return { ok: false, error: 'gone' }
  const bytes = await stageBytes(session.root, entry.rel, side === 'theirs' ? 3 : 2)
  if (bytes === null) return { ok: false, error: 'unreadable' }
  try {
    writeFileSync(join(session.root, entry.rel), bytes)
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) }
  }
  markResolved(entry)
  return { ok: true, rel: entry.rel }
}

/**
 * The three-way payload for a row, so a file OTHER than the one this launch was
 * given can be opened. Main remembers which row is open; that is what a later
 * write targets.
 */
export async function openConflictAt(index) {
  const entry = await verifiedEntry(index)
  if (!entry || entry.state === 'blocked') return { ok: false, error: 'blocked' }
  const { buffer } = readAt(session.root)(entry.rel)
  if (!buffer || isBinaryBuffer(buffer)) return { ok: false, error: 'blocked' }
  session.openRel = entry.rel
  return {
    ok: true,
    fileName: entry.name,
    content: buffer.toString('utf8'),
    position: index + 1,
    total: session.entries.length,
    ...(await stagesFor(session.root, entry.rel))
  }
}

/** The row the view is currently editing, when it is not the launch's own file. */
export function openRel() {
  return session?.openRel ?? null
}

export function clearOpenRel() {
  if (session) session.openRel = null
}

/** Write a row the launch did not name. Verified again on the way in. */
export async function writeConflictText(text) {
  if (!session?.openRel || typeof text !== 'string') return { ok: false, error: 'no-merge' }
  const index = indexOfRel(session.openRel)
  const entry = await verifiedEntry(index)
  if (!entry) return { ok: false, error: 'gone' }
  try {
    writeFileSync(join(session.root, entry.rel), text, 'utf8')
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) }
  }
  markResolved(entry)
  session.openRel = null
  return { ok: true }
}
