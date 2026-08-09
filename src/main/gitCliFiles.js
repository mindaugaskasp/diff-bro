// A `revision:path` side of a `diffbro compare`, turned into a real file the
// rest of the app can open. Only MAIN talks to git, and only main writes these
// copies — the renderer receives a path like any other.
//
// The copies live in a temp directory named the way gitTool's do, so the same
// sweep clears both.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { readBlobArgs, resolveRevisionArgs, repoRootArgs, runGitIn } from './gitRepo'
import { TEMP_PREFIX } from './gitTool'

// A revision is not a filename: `origin/main` and `HEAD~1` both have to become
// one directory that a reader recognises in a tab title.
const asFolder = (revision) => revision.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 40) || 'rev'

/**
 * @param {{revision: string, relPath: string}} side
 * @param {string} cwd  the shell's working directory
 * @returns {Promise<{path: string}|{error: string}>}
 */
export async function fileAtRevision(side, cwd) {
  const root = await runGitIn(repoRootArgs(), cwd)
  if (!root.ok || !root.stdout.trim()) return { error: 'not-a-repo' }
  const dir = root.stdout.trim()
  const resolved = await runGitIn(resolveRevisionArgs(side.revision), dir)
  if (!resolved.ok) return { error: 'no-such-revision' }
  const blob = await runGitIn(readBlobArgs(side.revision, side.relPath), dir)
  if (!blob.ok) return { error: 'not-in-revision' }

  const stage = mkdtempSync(join(tmpdir(), TEMP_PREFIX))
  const folder = join(stage, asFolder(side.revision))
  mkdirSync(folder, { recursive: true })
  const path = join(folder, basename(side.relPath) || 'file')
  writeFileSync(path, blob.stdout, 'utf8')
  return { path }
}

/**
 * Literal key ids, not a key built from the error at the call site: an assembled
 * key is invisible to check:i18n and cannot be found when it goes stale.
 */
export const REVISION_ERROR_KEYS = {
  'not-a-repo': 'cliErrors.not-a-repo',
  'no-such-revision': 'cliErrors.no-such-revision',
  'not-in-revision': 'cliErrors.not-in-revision'
}

/** Whether a compare side still has to be fetched out of the repository. */
export const isRevisionSide = (side) => !!side && typeof side === 'object' && !!side.revision
