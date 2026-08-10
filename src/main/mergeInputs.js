// What the view needs about a conflict, read out of git rather than out of the
// working copy's markers: the three stages the index already holds, the names
// the two sides go by, and where this file sits in the walk.
import { realpathSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import { readStageArgs, repoRootArgs, revisionNameArgs, runGitIn, unmergedArgs } from './gitRepo'
import { walkPosition } from './mergeSession'

// A branch name and nothing else: `name-rev` answers `main~2` for a commit that
// is not a branch tip, which names no side and is worse than saying nothing.
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/

const real = (path) => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

async function branchName(ref, dir) {
  const res = await runGitIn(revisionNameArgs(ref), dir)
  const name = res.ok ? res.stdout.trim() : ''
  return BRANCH.test(name) ? name : ''
}

/**
 * `Ours · main` beside `Theirs · feature`, when git can say. A rebase or a
 * cherry-pick writes no MERGE_HEAD, so both come back empty and the panes keep
 * their plain labels rather than claiming a branch that is not the one.
 */
async function revisionNames(dir) {
  const [oursName, theirsName] = await Promise.all([
    branchName('HEAD', dir),
    branchName('MERGE_HEAD', dir)
  ])
  return { oursName, theirsName }
}

/**
 * The three inputs git already holds. Absent — a mergetool invoked by hand, a
 * file with no index entry — the view falls back to reconstructing the sides
 * from the markers themselves.
 * @returns {Promise<object>} merged into the renderer's payload
 */
export async function mergeInputsFor(merged) {
  const root = await runGitIn(repoRootArgs(), dirname(merged))
  if (!root.ok || !root.stdout.trim()) return {}
  const dir = root.stdout.trim()
  // Through realpath first: on macOS a repo under /var is reported by git as
  // /private/var, and relative() between the two forms yields a path full of
  // `..` that the fence then rejects — the index read failed silently and the
  // view fell back to reconstructing the sides from the markers.
  const rel = relative(real(dir), real(merged))
  try {
    const [base, ours, theirs] = await Promise.all(
      [1, 2, 3].map((stage) => runGitIn(readStageArgs(stage, rel), dir))
    )
    if (!ours.ok || !theirs.ok) return {}
    const [unmerged, names] = await Promise.all([runGitIn(unmergedArgs(), dir), revisionNames(dir)])
    const files = unmerged.ok ? unmerged.stdout.split('\n').filter(Boolean).length : 0
    return {
      ours: ours.stdout,
      theirs: theirs.stdout,
      base: base.ok ? base.stdout : null,
      ...names,
      ...walkPosition(files, merged)
    }
  } catch {
    return {}
  }
}
