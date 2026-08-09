// Reading a file out of a git revision. READ ONLY: `rev-parse` and `show` are
// the whole vocabulary, so nothing here can ask git to reach the network.
//
// The fence is in docs/security.md; what is not obvious from the code is why
// each hardening flag is there, so those are noted at the constant itself.
import { execFile } from 'node:child_process'

/**
 * Applied to EVERY invocation. A repo's own config must not be able to run
 * anything: hooks are pointed at nothing, the filesystem monitor — which is a
 * command git will spawn — is emptied, and no pager is launched.
 */
export const HARDENING = Object.freeze([
  '--no-pager',
  '-c',
  'core.hooksPath=',
  '-c',
  'core.fsmonitor=',
  '-c',
  'core.editor=true',
  '-c',
  'protocol.ext.allow=never'
])

// Deliberately narrower than git's own rules: the shapes a reader types, and
// nothing that could be read as an option or reach a shell.
const REVISION = /^[A-Za-z0-9][A-Za-z0-9._/@{}^~-]*$/
const MAX_REVISION = 255

/** @param {unknown} rev */
export function isSafeRevision(rev) {
  if (typeof rev !== 'string' || !rev || rev.length > MAX_REVISION) return false
  if (rev.startsWith('-')) return false
  return REVISION.test(rev)
}

// git speaks posix paths in a `rev:path` pair whatever the platform, and a path
// that climbs out of the repository is not a path in it.
function repoPath(path) {
  const posix = String(path ?? '').replace(/\\/g, '/')
  if (!posix || posix.startsWith('/') || posix.startsWith('-')) return null
  if (posix.split('/').includes('..')) return null
  return posix
}

function checkedRevision(rev) {
  if (!isSafeRevision(rev)) throw new Error('unsafe-revision')
  return rev
}

/** Where the repository containing the working directory begins. */
export function repoRootArgs() {
  return [...HARDENING, 'rev-parse', '--show-toplevel']
}

/** Resolve a revision to the commit it names, or fail. */
export function resolveRevisionArgs(rev) {
  return [
    ...HARDENING,
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${checkedRevision(rev)}^{commit}`
  ]
}

/** Read one file as it stood at a revision. */
export function readBlobArgs(rev, path) {
  const safe = repoPath(path)
  if (!safe) throw new Error('unsafe-path')
  return [...HARDENING, 'show', '--end-of-options', `${checkedRevision(rev)}:${safe}`]
}

/**
 * The environment a git invocation gets. Every inherited GIT_* is DROPPED:
 * GIT_DIR, GIT_INDEX_FILE and GIT_ALTERNATE_OBJECT_DIRECTORIES each redirect git
 * at something other than the repository main chose, and inheriting them hands
 * that redirect to whoever launched the app.
 * @param {Record<string, string|undefined>} [base]
 */
export function gitEnv(base = process.env) {
  const env = {}
  for (const [key, value] of Object.entries(base)) {
    if (!key.startsWith('GIT_')) env[key] = value
  }
  env.GIT_CONFIG_NOSYSTEM = '1'
  env.GIT_TERMINAL_PROMPT = '0'
  return env
}

/**
 * One git invocation, in a directory MAIN chose. Resolves rather than rejects so
 * a missing revision is an answer, not a crash.
 * @param {string[]} args  one of the vectors above — never assembled by a caller
 * @param {string} cwd
 * @returns {Promise<{ok: boolean, stdout: string, error: string}>}
 */
export function runGitIn(args, cwd) {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd,
        windowsHide: true,
        maxBuffer: 64 * 1024 * 1024,
        env: gitEnv()
      },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout: String(stdout ?? ''),
          error: err ? String(stderr ?? err.message).trim() : ''
        })
      }
    )
  })
}
