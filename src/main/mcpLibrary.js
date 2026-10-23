// Secret snippets and received diffs are never visible to Claude, whatever the scopes.
import { diffAad, snippetAad } from '../shared/entryAad'

const isSecret = (entry) => entry?.secret === true
const isReceived = (entry) => entry?.from != null
const isLive = (entry, now) => entry.expiresAt === null || entry.expiresAt > now

const entriesOf = (store) => (Array.isArray(store?.entries) ? store.entries : [])
const tagsOf = (entry) => (Array.isArray(entry.tags) ? entry.tags : [])

/**
 * @param {{ query?: string, tags?: string[] }} filter
 * @returns {(entry: object) => boolean}
 */
function matches({ query, tags }) {
  const needle = query?.toLowerCase() ?? ''
  return (entry) =>
    String(entry.name ?? '')
      .toLowerCase()
      .includes(needle) && (tags ?? []).every((t) => tagsOf(entry).includes(t))
}

const visibleSnippets = (store) => entriesOf(store).filter((e) => !isSecret(e))

const visibleDiffs = (store, now) =>
  entriesOf(store).filter((e) => !isReceived(e) && isLive(e, now))

export function listSnippets(store, filter = {}) {
  return visibleSnippets(store)
    .filter(matches(filter))
    .map((e) => ({
      id: e.id,
      name: e.name,
      language: e.language === 'auto' ? (e.detected ?? null) : e.language,
      tags: tagsOf(e),
      updatedAt: e.updatedAt ?? e.createdAt
    }))
}

export function listDiffs(store, now, filter = {}) {
  return visibleDiffs(store, now)
    .filter(matches(filter))
    .map((e) => ({
      id: e.id,
      name: e.name,
      format: e.format ?? null,
      tags: tagsOf(e),
      createdAt: e.createdAt,
      expiresAt: e.expiresAt
    }))
}

/**
 * @param {object} store
 * @param {string} id
 * @param {(box: {iv: string, data: string}, aad: string) => string|null} decrypt
 * @returns {{ entry: object, content: string }|null}
 */
export function readSnippet(store, id, decrypt) {
  const entry = visibleSnippets(store).find((e) => e.id === id)
  if (!entry) return null
  const content = decrypt(entry, snippetAad(entry.id, entry.aadSalt, entry.createdAt))
  return content === null ? null : { entry, content }
}

const sideOf = (file, pasted, pastedName) =>
  file?.content != null
    ? { name: file.name ?? '', text: String(file.content) }
    : { name: pastedName ?? '', text: String(pasted ?? '') }

export function sidesOf(payload) {
  const isPaste = payload?.mode === 'paste'
  return {
    left: sideOf(isPaste ? null : payload?.left, payload?.pasteLeft, payload?.pasteLeftName),
    right: sideOf(isPaste ? null : payload?.right, payload?.pasteRight, payload?.pasteRightName)
  }
}

/**
 * @returns {{ entry: object, sides: ReturnType<typeof sidesOf> }|null}
 */
export function readDiff(store, id, now, decrypt) {
  const entry = visibleDiffs(store, now).find((e) => e.id === id)
  if (!entry) return null
  const plaintext = decrypt(entry, diffAad(entry.id, entry.createdAt, entry.expiresAt, entry.from))
  if (plaintext === null) return null
  try {
    return { entry, sides: sidesOf(JSON.parse(plaintext)) }
  } catch {
    return null
  }
}
