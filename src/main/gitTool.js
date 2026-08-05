// Registers Diff Bro with git as a difftool/mergetool. Two halves, both pure
// enough to unit-test: the launcher script git actually runs, and the exact
// `git config` argument vectors that add or remove the registration.
//
// git is invoked with a FIXED argv through execFile — never a shell, and never
// a string the renderer supplied. Editing ~/.gitconfig by hand would be the
// only alternative, and git owns that file's format.

import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { dirname, join, posix, win32 } from 'node:path'
import { execFile } from 'node:child_process'
import { shQuote } from './shellQuote'

export const GIT_TOOL_NAME = 'diffbro'
const MARK = '# diff-bro git tool'

/**
 * Where the launcher lives — beside the `diffbro` shim, so removing either
 * leaves the other alone.
 * @param {{ platform?: string, home: string, localAppData?: string }} env
 * @returns {string}
 */
export function gitToolTarget({ platform = process.platform, home, localAppData }) {
  // The TARGET platform's separator, never the host's — see cliShim.shimTarget.
  if (platform === 'win32') {
    const { join: wjoin } = win32
    return wjoin(localAppData || wjoin(home, 'AppData', 'Local'), 'DiffBro', 'bin', 'diffbro-git')
  }
  return posix.join(home, '.local', 'bin', 'diffbro-git')
}

// git hands a difftool two TEMPORARY files and deletes them the moment the
// command returns. Diff Bro's single-instance lock means the launch returns
// almost immediately — so the files are copied somewhere git does not own
// before the app is pointed at them. Basenames come from $MERGED (the path in
// the repo), so the comparison is labelled the way the reader expects rather
// than with git's random temp names.
export const TEMP_PREFIX = 'diffbro-git-'

/**
 * @param {string} exePath  the installed app binary
 * @returns {string}
 */
export function gitToolScript(exePath) {
  return `#!/bin/sh
${MARK}
name=\${3##*/}
[ -n "$name" ] || name=file
dir=$(mktemp -d "\${TMPDIR:-/tmp}/${TEMP_PREFIX}XXXXXX") || exit 1
mkdir -p "$dir/before" "$dir/after" || exit 1
cp -- "$1" "$dir/before/$name" 2>/dev/null
cp -- "$2" "$dir/after/$name" 2>/dev/null
exec ${shQuote(exePath)} difftool "$dir/before/$name" "$dir/after/$name"
`
}

// $LOCAL and $REMOTE are the two sides; $MERGED is the repo path, passed only
// so the copies keep the real filename.
const invocation = (script) => `"${script}" "$LOCAL" "$REMOTE" "$MERGED"`

/**
 * The registration, as git config argument vectors.
 *
 * Diff Bro shows a merge's two conflicting sides for READING; it never writes
 * $MERGED. trustExitCode=false is what keeps that honest — git asks whether the
 * merge succeeded instead of taking a clean exit as "resolved".
 * @param {string} script
 * @returns {string[][]}
 */
export function registerArgs(script) {
  const cmd = invocation(script)
  return [
    ['config', '--global', `difftool.${GIT_TOOL_NAME}.cmd`, cmd],
    ['config', '--global', `mergetool.${GIT_TOOL_NAME}.cmd`, cmd],
    ['config', '--global', `mergetool.${GIT_TOOL_NAME}.trustExitCode`, 'false'],
    ['config', '--global', 'diff.tool', GIT_TOOL_NAME],
    ['config', '--global', 'merge.tool', GIT_TOOL_NAME]
  ]
}

/**
 * Undo it. The tool sections go unconditionally; diff.tool/merge.tool are only
 * cleared when they still name us — someone else's default is not ours to drop.
 * @param {{ diffTool?: string, mergeTool?: string }} current
 * @returns {string[][]}
 */
export function unregisterArgs({ diffTool, mergeTool } = {}) {
  const args = [
    ['config', '--global', '--remove-section', `difftool.${GIT_TOOL_NAME}`],
    ['config', '--global', '--remove-section', `mergetool.${GIT_TOOL_NAME}`]
  ]
  if (diffTool === GIT_TOOL_NAME) args.push(['config', '--global', '--unset', 'diff.tool'])
  if (mergeTool === GIT_TOOL_NAME) args.push(['config', '--global', '--unset', 'merge.tool'])
  return args
}

/**
 * Run one `git` invocation. Resolves rather than rejects: `git config --unset`
 * on a key that is not set exits non-zero, which is a no-op, not a failure.
 * @param {string[]} args
 * @returns {Promise<{ ok: boolean, stdout: string }>}
 */
export function runGit(args) {
  return new Promise((resolve) => {
    execFile('git', args, { windowsHide: true }, (err, stdout) => {
      resolve({ ok: !err, stdout: String(stdout ?? '').trim() })
    })
  })
}

const looksLikeOurs = (file) => {
  try {
    return readFileSync(file, 'utf8').includes(MARK)
  } catch {
    return false
  }
}

/**
 * @param {{ home: string, platform?: string, localAppData?: string, git?: typeof runGit }} o
 * @returns {Promise<{ registered: boolean, available: boolean, target: string }>}
 */
export async function gitToolStatus({ home, platform, localAppData, git = runGit }) {
  const target = gitToolTarget({ platform, home, localAppData })
  const version = await git(['--version'])
  const cmd = await git(['config', '--global', '--get', `difftool.${GIT_TOOL_NAME}.cmd`])
  return {
    available: version.ok,
    registered: version.ok && cmd.ok && cmd.stdout.includes(target),
    target
  }
}

/**
 * @param {{ exePath: string, home: string, platform?: string, localAppData?: string,
 *          git?: typeof runGit }} o
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function registerGitTool({ exePath, home, platform, localAppData, git = runGit }) {
  const target = gitToolTarget({ platform, home, localAppData })
  if (!(await git(['--version'])).ok) return { ok: false, error: 'git is not on your PATH.' }
  try {
    if (existsSync(target) && !looksLikeOurs(target)) {
      return { ok: false, error: 'A different diffbro-git exists there.' }
    }
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, gitToolScript(exePath), 'utf8')
    if (platform !== 'win32' && process.platform !== 'win32') chmodSync(target, 0o755)
  } catch (e) {
    return { ok: false, error: e.message }
  }
  for (const args of registerArgs(target)) {
    const res = await git(args)
    if (!res.ok) return { ok: false, error: 'git refused the configuration.' }
  }
  return { ok: true }
}

/**
 * @param {{ home: string, platform?: string, localAppData?: string, git?: typeof runGit }} o
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function unregisterGitTool({ home, platform, localAppData, git = runGit }) {
  const diffTool = await git(['config', '--global', '--get', 'diff.tool'])
  const mergeTool = await git(['config', '--global', '--get', 'merge.tool'])
  for (const args of unregisterArgs({ diffTool: diffTool.stdout, mergeTool: mergeTool.stdout })) {
    await git(args)
  }
  const target = gitToolTarget({ platform, home, localAppData })
  try {
    if (!existsSync(target) || looksLikeOurs(target)) rmSync(target, { force: true })
  } catch (e) {
    return { ok: false, error: e.message }
  }
  return { ok: true }
}

// The launcher's copies outlive the comparison — nothing tells it when the tab
// closed. A day is long past any reading of a diff, and the sweep is bounded to
// directories this app's own launcher named.
export const TEMP_TTL_MS = 24 * 3600 * 1000

/**
 * @param {string} dir  the OS temp directory
 * @param {number} [now]
 * @returns {number} how many were removed
 */
export function sweepGitTemp(dir, now = Date.now()) {
  let removed = 0
  let names
  try {
    names = readdirSync(dir)
  } catch {
    return 0
  }
  for (const name of names) {
    if (!name.startsWith(TEMP_PREFIX)) continue
    const path = join(dir, name)
    try {
      // lstat, not stat: a planted symlink would otherwise be aged by its
      // TARGET's mtime (clipboardStage.js does the same).
      const info = lstatSync(path)
      if (!info.isDirectory()) continue
      if (now - info.mtimeMs < TEMP_TTL_MS) continue
      rmSync(path, { recursive: true, force: true })
      removed += 1
    } catch {
      continue
    }
  }
  return removed
}
