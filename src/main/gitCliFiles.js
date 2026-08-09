// A `revision:path` side of a `diffbro compare`, read straight out of the
// repository. Only MAIN talks to git.
//
// The content is handed over as a loaded FILE, not staged on disk: a temp copy
// has to live somewhere the renderer is allowed to read, which `file:read`
// refuses under userData — and it would then outlive the comparison with
// nothing to tell it the tab had closed.
import { basename } from 'node:path'
import { readBlobArgs, resolveRevisionArgs, repoRootArgs, runGitIn } from './gitRepo'

/**
 * @param {{revision: string, relPath: string}} side
 * @param {string} cwd  the shell's working directory
 * @returns {Promise<{file: {path: null, name: string, content: string}}|{error: string}>}
 */
export async function fileAtRevision(side, cwd) {
  const root = await runGitIn(repoRootArgs(), cwd)
  if (!root.ok || !root.stdout.trim()) return { error: 'not-a-repo' }
  const dir = root.stdout.trim()
  const resolved = await runGitIn(resolveRevisionArgs(side.revision), dir)
  if (!resolved.ok) return { error: 'no-such-revision' }
  const blob = await runGitIn(readBlobArgs(side.revision, side.relPath), dir)
  if (!blob.ok) return { error: 'not-in-revision' }
  return {
    // Named for the revision it came from, so two sides of the same file are
    // told apart in the slot and the tab title.
    file: {
      path: null,
      name: `${basename(side.relPath) || 'file'} @ ${side.revision}`,
      content: blob.stdout
    }
  }
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
