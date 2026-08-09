// The two sides as a comparable pair of lockfiles, or nothing. Pure.
import { parseLockfile } from './parse'

/**
 * Both sides must parse AND be the same ecosystem: a package-lock against a
 * go.sum is two dependency lists, not a comparison.
 * @returns {{left: object, right: object}|null}
 */
export function lockPairOf(left, right) {
  const a = parseLockfile(left?.content, left?.name)
  const b = parseLockfile(right?.content, right?.name)
  return a && b && a.kind === b.kind ? { left: a, right: b } : null
}
