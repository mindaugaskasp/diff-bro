// Lockfiles, read as the dependency SETS they describe rather than as the text
// they are written in. One shape out, whatever went in. Pure.
//
// No package manager is consulted and no registry is contacted — everything
// reported comes out of the file in front of the reader (rule 1).
import { parseNpmLock } from './npm'
import { parsePnpmLock } from './pnpm'
import { parseYarnLock } from './yarn'
import { parseGoSum } from './go'

/**
 * A lockfile is untrusted input. Past this many entries the reader is not
 * reading a dependency list, and the renderer should not try to lay one out.
 */
const MAX_PACKAGES = 50000

/** Recognised by FILENAME: a lockfile's name is its format. */
export const LOCKFILE_KINDS = [
  { name: 'package-lock.json', kind: 'npm', parse: parseNpmLock },
  { name: 'npm-shrinkwrap.json', kind: 'npm', parse: parseNpmLock },
  { name: 'pnpm-lock.yaml', kind: 'pnpm', parse: parsePnpmLock },
  { name: 'yarn.lock', kind: 'yarn', parse: parseYarnLock },
  { name: 'go.sum', kind: 'go', parse: parseGoSum }
]

const baseName = (name) =>
  String(name ?? '')
    .split(/[\\/]/)
    .pop()
    .toLowerCase()

/** Whether this file is one this module can read, by name alone. */
export function lockfileKind(fileName) {
  return LOCKFILE_KINDS.find((k) => k.name === baseName(fileName)) ?? null
}

/**
 * @param {string} text
 * @param {string} fileName  the name decides the format
 * @returns {{kind: string, packages: Array<{name: string, version: string,
 *   direct: boolean, dev: boolean, license: string, resolved: string}>,
 *   knowsDirect: boolean, truncated: boolean}|null} null when the file is not a
 *   lockfile, or is one that will not parse — the caller keeps the text view.
 */
export function parseLockfile(text, fileName) {
  const format = lockfileKind(fileName)
  if (!format || typeof text !== 'string') return null
  let parsed
  try {
    parsed = format.parse(text)
  } catch {
    return null
  }
  if (!parsed?.packages?.length) return null
  return {
    kind: format.kind,
    packages: parsed.packages.slice(0, MAX_PACKAGES),
    knowsDirect: parsed.knowsDirect === true,
    truncated: parsed.packages.length > MAX_PACKAGES
  }
}
