// Puts `diffbro` on PATH without touching a system directory or asking for
// admin rights: a tiny shim in the user's own bin dir that execs the installed
// app with the arguments appended. The app's single-instance lock does the rest.
//
// Shim CONTENT and target are pure so they can be unit-tested; the fs writes
// live in the installer below.

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'

export const SHIM_NAME = 'diffbro'

/**
 * Where the shim goes. ~/.local/bin is the XDG convention and is already on
 * PATH for most shells; Windows gets a .cmd under LOCALAPPDATA.
 * @param {{ platform?: string, home: string, localAppData?: string }} env
 * @returns {string}
 */
export function shimTarget({ platform = process.platform, home, localAppData }) {
  if (platform === 'win32') {
    return join(localAppData || join(home, 'AppData', 'Local'), 'DiffBro', 'bin', 'diffbro.cmd')
  }
  return join(home, '.local', 'bin', SHIM_NAME)
}

// A marker rather than a version string: the shim is rewritten on every install,
// and what matters is only whether WE wrote the file we are about to replace.
const MARK = '# diff-bro cli shim'

/**
 * @param {string} exePath  the installed app binary
 * @param {string} [platform]
 * @returns {string}
 */
export function shimScript(exePath, platform = process.platform) {
  if (platform === 'win32') {
    return `@echo off\r\nrem diff-bro cli shim\r\nstart "" "${exePath}" %*\r\n`
  }
  // exec so the shim leaves no shell behind, and "$@" so paths with spaces
  // survive as single arguments.
  return `#!/bin/sh\n${MARK}\nexec "${exePath}" "$@"\n`
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
 * @param {{ exePath: string, home: string, platform?: string, localAppData?: string }} o
 * @returns {{ installed: boolean, target: string, onPath: boolean }}
 */
export function shimStatus({ home, platform = process.platform, localAppData }) {
  const target = shimTarget({ platform, home, localAppData })
  return { installed: existsSync(target) && looksLikeOurs(target), target, onPath: onPath(target) }
}

/**
 * Never clobbers a file we did not write — an unrelated `diffbro` on PATH is
 * the user's, not ours to replace.
 * @param {{ exePath: string, home: string, platform?: string, localAppData?: string }} o
 * @returns {{ ok: boolean, target: string, onPath: boolean, error?: string }}
 */
export function installShim({ exePath, home, platform = process.platform, localAppData }) {
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
    writeFileSync(target, shimScript(exePath, platform), 'utf8')
    if (platform !== 'win32') chmodSync(target, 0o755)
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
