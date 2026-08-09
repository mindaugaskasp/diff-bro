// The git surface the renderer may reach, and nothing else. Two questions —
// "is this a repository?" and "what did this file look like at that revision?"
// — and both are answered by src/main/gitRepo.js behind its fence.
//
// The renderer names a REVISION and a path; it never names a command, a cwd or
// a git argument. Main resolves the repository from the path it was given, so a
// renderer cannot point git at a directory of its choosing.
import { ipcMain } from 'electron'
import { dirname } from 'node:path'
import { readBlobArgs, repoRootArgs, resolveRevisionArgs, runGitIn } from './gitRepo'

const MAX_BLOB = 32 * 1024 * 1024

async function repoRootOf(filePath) {
  if (typeof filePath !== 'string' || !filePath) return null
  const res = await runGitIn(repoRootArgs(), dirname(filePath))
  return res.ok && res.stdout.trim() ? res.stdout.trim() : null
}

/**
 * The file as it stood at a revision, with the repository worked out from the
 * file itself.
 */
async function readAtRevision(filePath, revision, relPath) {
  const root = await repoRootOf(filePath)
  if (!root) return { error: 'not-a-repo' }
  const resolved = await runGitIn(resolveRevisionArgs(revision), root)
  if (!resolved.ok) return { error: 'no-such-revision' }
  const blob = await runGitIn(readBlobArgs(revision, relPath), root)
  if (!blob.ok) return { error: 'not-in-revision' }
  if (blob.stdout.length > MAX_BLOB) return { error: 'too-large' }
  return { content: blob.stdout, commit: resolved.stdout.trim().slice(0, 12) }
}

export function registerGitIpc() {
  ipcMain.handle('git:root', async (e, filePath) => ({ root: await repoRootOf(filePath) }))

  ipcMain.handle('git:show', async (e, payload) => {
    const { path: filePath, revision, relPath } = payload ?? {}
    try {
      return await readAtRevision(filePath, revision, relPath)
    } catch {
      // An unsafe revision or path throws inside the fence; the renderer gets a
      // refusal, never the reason it was refused.
      return { error: 'refused' }
    }
  })
}
