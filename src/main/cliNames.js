// Completion candidates for the CLI's name prompt, read from the store file:
// the CLI process runs before the single-instance lock, so it has no store to
// ask, but a snippet's NAME is plaintext metadata beside its ciphertext.
import { indexableNames, matchingNames } from '../shared/nameComplete'

/**
 * @param {string|null} raw  the snippets store file, as read
 * @returns {string[]}
 */
export function namesFrom(raw) {
  try {
    return indexableNames(JSON.parse(raw ?? 'null')?.entries)
  } catch {
    return []
  }
}

// One argument, and the value is RETURNED: readline/promises awaits the
// completer rather than calling back, and a 2-argument callback form resolves to
// undefined and throws out of readline internals. It inserts the hits' common
// prefix — the editor's ghost-text rule — and lists them on a second Tab.
export const nameCompleter = (names) => (line) => [matchingNames(line, names), line]
