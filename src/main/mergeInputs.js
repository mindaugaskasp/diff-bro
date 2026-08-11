// What the view needs about a conflict, read out of git rather than out of the
// working copy's markers: the three stages the index already holds, the names
// the two sides go by, and where this file sits in the walk.
import { realpathSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import {
  readStageArgs,
  repoRootArgs,
  revisionNameArgs,
  runGitIn,
  splitNulPaths,
  unmergedArgs
} from './gitRepo'
import { walkPosition } from './mergeSession'
import { isBinaryBuffer, MAX_MERGE_BYTES } from './mergeGuards'

// A stage that is too big, or not text, sends the view back to reconstructing
// the sides from the markers — which is the designed fallback, not a failure.
const usableStage = (res) =>
  res.ok &&
  Buffer.byteLength(res.stdout, 'utf8') <= MAX_MERGE_BYTES &&
  !isBinaryBuffer(Buffer.from(res.stdout, 'utf8'))

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
 * The three stages and the two branch names, for a file named by the repository
 * that holds it. Empty when git cannot give both sides — the view then falls
 * back to reconstructing them from the markers, which is the designed fallback.
 * @param {string} dir  the repository root, computed in main
 * @param {string} rel  repo-relative, posix
 */
export async function stagesFor(dir, rel) {
  try {
    const [base, ours, theirs] = await Promise.all(
      [1, 2, 3].map((stage) => runGitIn(readStageArgs(stage, rel), dir))
    )
    if (!usableStage(ours) || !usableStage(theirs)) return {}
    return {
      ours: ours.stdout,
      theirs: theirs.stdout,
      base: usableStage(base) ? base.stdout : null,
      ...(await revisionNames(dir))
    }
  } catch {
    return {}
  }
}

/**
 * The three inputs git already holds, for the file THIS launch was given, plus
 * where it sits in the walk.
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
  const stages = await stagesFor(dir, relative(real(dir), real(merged)))
  if (!stages.ours) return {}
  const unmerged = await runGitIn(unmergedArgs(), dir)
  const files = unmerged.ok ? splitNulPaths(unmerged.stdout).length : 0
  return { ...stages, ...walkPosition(files, merged) }
}
