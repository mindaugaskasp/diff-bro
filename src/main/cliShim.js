// Puts `diffbro` on PATH without touching a system directory or asking for
// admin rights: a tiny shim in the user's own bin dir that execs the installed
// app with the arguments appended. The app's single-instance lock does the rest.
//
// Shim CONTENT and target are pure so they can be unit-tested; the fs writes
// live in the installer below.

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, posix, win32 } from 'node:path'
import { shQuote } from './shellQuote'

export const SHIM_NAME = 'diffbro'

/**
 * Where the shim goes. ~/.local/bin is the XDG convention and is already on
 * PATH for most shells; Windows gets a .cmd under LOCALAPPDATA.
 * @param {{ platform?: string, home: string, localAppData?: string }} env
 * @returns {string}
 */
export function shimTarget({ platform = process.platform, home, localAppData }) {
  // The TARGET platform's separator, never the host's: bare `join` builds a
  // backslash path for ~/.local/bin when the tests run on Windows.
  if (platform === 'win32') {
    const { join } = win32
    return join(localAppData || join(home, 'AppData', 'Local'), 'DiffBro', 'bin', 'diffbro.cmd')
  }
  return posix.join(home, '.local', 'bin', SHIM_NAME)
}

// A marker rather than a version string: the shim is rewritten on every install,
// and what matters is only whether WE wrote the file we are about to replace.
const MARK = '# diff-bro cli shim'

/**
 * `entryPath` is only set for an UNPACKAGED run, where `app.getPath('exe')` is
 * the Electron binary rather than the app: `exec .../Electron "$@"` turns
 * `diffbro help` into `Electron help`, and Electron reads that bare verb as the
 * path of an app to launch ("Unable to find Electron app at <cwd>/help").
 * @param {string} exePath  the app binary, or Electron's when unpackaged
 * @param {string} [platform]
 * @param {string|null} [entryPath]  the app directory, unpackaged runs only
 * @returns {string}
 */
export function shimScript(exePath, platform = process.platform, entryPath = null) {
  if (platform === 'win32') {
    const entry = entryPath ? ` "${entryPath}"` : ''
    return `@echo off\r\nrem diff-bro cli shim\r\nstart "" "${exePath}"${entry} %*\r\n`
  }
  // exec so the shim leaves no shell behind, and "$@" so paths with spaces
  // survive as single arguments.
  const entry = entryPath ? ` ${shQuote(entryPath)}` : ''
  return `#!/bin/sh\n${MARK}\nexec ${shQuote(exePath)}${entry} "$@"\n`
}

/**
 * @param {string} target
 * @param {string} [pathEnv]
 * @returns {boolean} whether the shim's directory is on PATH
 */
export function onPath(target, pathEnv = process.env.PATH || '') {
  const dir = dirname(target)
  return pathEnv.split(delimiter).filter(Boolean).includes(dir)
}

const looksLikeOurs = (file) => {
  try {
    return readFileSync(file, 'utf8').includes('diff-bro cli shim')
  } catch {
    return false
  }
}

/**
 * @param {{ home: string, platform?: string, localAppData?: string, exePath?: string,
 *           entryPath?: string|null }} o
 * @returns {{ installed: boolean, target: string, onPath: boolean, stale: boolean }}
 */
export function shimStatus({
  home,
  platform = process.platform,
  localAppData,
  exePath,
  entryPath
}) {
  const target = shimTarget({ platform, home, localAppData })
  const installed = existsSync(target) && looksLikeOurs(target)
  // A shim is only written on install, so fixing the generator does nothing for
  // one already on disk. Comparing against what we WOULD write is the only way
  // Settings can tell the reader a reinstall is worth it.
  const stale =
    installed &&
    !!exePath &&
    readFileSync(target, 'utf8') !== shimScript(exePath, platform, entryPath)
  return { installed, target, onPath: onPath(target), stale }
}

/**
 * Never clobbers a file we did not write — an unrelated `diffbro` on PATH is
 * the user's, not ours to replace.
 * @param {{ exePath: string, home: string, platform?: string, localAppData?: string,
 *           entryPath?: string|null }} o
 * @returns {{ ok: boolean, target: string, onPath: boolean, error?: string }}
 */
export function installShim({
  exePath,
  home,
  platform = process.platform,
  localAppData,
  entryPath = null
}) {
  const target = shimTarget({ platform, home, localAppData })
  try {
    if (existsSync(target) && !looksLikeOurs(target)) {
      return {
        ok: false,
        target,
        onPath: onPath(target),
        error: 'A different diffbro exists there.'
      }
    }
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, shimScript(exePath, platform, entryPath), 'utf8')
    // Windows has no exec bit, and a host check is what gitTool.js already does.
    if (platform !== 'win32' && process.platform !== 'win32') chmodSync(target, 0o755)
    return { ok: true, target, onPath: onPath(target) }
  } catch (e) {
    return { ok: false, target, onPath: onPath(target), error: e.message }
  }
}

/**
 * @param {{ home: string, platform?: string, localAppData?: string }} o
 * @returns {{ ok: boolean, error?: string }}
 */
export function removeShim({ home, platform = process.platform, localAppData }) {
  const target = shimTarget({ platform, home, localAppData })
  try {
    if (existsSync(target) && !looksLikeOurs(target)) {
      return { ok: false, error: 'A different diffbro exists there.' }
    }
    rmSync(target, { force: true })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
