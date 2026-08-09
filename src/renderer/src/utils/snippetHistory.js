// Version arithmetic for the snippet library. A version IS the superseded
// encrypted box: the AAD binds only immutable fields, so old ciphertext stays
// decryptable without ever re-handling plaintext.

export const MAX_SNIPPET_HISTORY = 20

const isVersion = (v) =>
  Number.isFinite(v?.savedAt) && typeof v?.iv === 'string' && typeof v?.data === 'string'

/**
 * Untrusted-input guard for a persisted entry's history (rule 6): anything but
 * a well-formed, capped list of versions collapses to what is valid.
 * @param {unknown} value
 * @returns {{ savedAt: number, iv: string, data: string }[]}
 */
export const validHistory = (value) =>
  Array.isArray(value) ? value.filter(isVersion).slice(-MAX_SNIPPET_HISTORY) : []

/**
 * Move the entry's current box into its history before an edit overwrites it.
 * `savedAt` is when that content was WRITTEN (its updatedAt), not when it was
 * superseded. Oldest versions fall off the front at the cap.
 * @param {import('../types').SnippetEntry} entry
 */
export function recordVersion(entry) {
  const versions = Array.isArray(entry.history) ? entry.history : (entry.history = [])
  versions.push({ savedAt: entry.updatedAt, iv: entry.iv, data: entry.data })
  if (versions.length > MAX_SNIPPET_HISTORY) {
    versions.splice(0, versions.length - MAX_SNIPPET_HISTORY)
  }
}

/**
 * The history dialog's rail: current first, then history newest-first.
 * `index` addresses entry.history for loadVersion; -1 is the current content.
 * @param {import('../types').SnippetEntry|null|undefined} entry
 * @returns {{ index: number, at: number }[]}
 */
export const versionRows = (entry) => [
  { index: -1, at: entry?.updatedAt ?? 0 },
  ...(entry?.history ?? []).map((v, index) => ({ index, at: v.savedAt })).reverse()
]
