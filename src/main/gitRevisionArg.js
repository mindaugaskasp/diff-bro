// `HEAD~1:src/a.js` — the `revision:path` shape git itself uses, as a CLI
// argument. Pure, so the grammar is testable without a repository.
import { isSafeRevision } from './gitRepo'

// A single letter before the colon is a Windows drive, not a revision: `C:/x`
// must stay a path.
const WINDOWS_DRIVE = /^[A-Za-z]:[\\/]/

/**
 * @param {unknown} arg
 * @returns {{revision: string, relPath: string}|null} null when the argument is
 *   an ordinary path, which is most of them.
 */
export function splitRevisionArg(arg) {
  if (typeof arg !== 'string' || WINDOWS_DRIVE.test(arg)) return null
  const at = arg.indexOf(':')
  if (at <= 0 || at === arg.length - 1) return null
  const revision = arg.slice(0, at)
  const relPath = arg.slice(at + 1)
  // The path half keeps any further colons; only the FIRST one separates.
  return isSafeRevision(revision) && relPath ? { revision, relPath } : null
}
