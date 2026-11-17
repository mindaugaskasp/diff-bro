export const SNIPPET_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const ITEM_LIMITS = { name: 512, content: 5 * 1024 * 1024, language: 40, tags: 20, tag: 40 }

const isText = (v, max) => typeof v === 'string' && v.length <= max
const isTime = (v) => Number.isSafeInteger(v) && v > 0

export function snippetEntry({ name, content, language, tags }, now) {
  return {
    kind: 'snippet',
    name,
    createdAt: now,
    expiresAt: now + SNIPPET_TTL_MS,
    snippet: { content, language: language ?? 'auto', tags: Array.isArray(tags) ? tags : [] }
  }
}

const isTags = (tags) =>
  Array.isArray(tags) &&
  tags.length <= ITEM_LIMITS.tags &&
  tags.every((t) => isText(t, ITEM_LIMITS.tag))

function isSnippetBody(s) {
  return (
    !!s &&
    typeof s === 'object' &&
    isText(s.content, ITEM_LIMITS.content) &&
    isText(s.language, ITEM_LIMITS.language) &&
    isTags(s.tags)
  )
}

export function isValidItemEntry(entry) {
  if (!entry || typeof entry !== 'object') return false
  const base =
    isText(entry.name, ITEM_LIMITS.name) &&
    entry.name.length > 0 &&
    isTime(entry.createdAt) &&
    isTime(entry.expiresAt)
  if (!base) return false
  if (entry.kind === 'snippet') return isSnippetBody(entry.snippet)
  return entry.kind === 'diff' && !!entry.snapshot && typeof entry.snapshot === 'object'
}

export const itemSummary = ({ id, receivedAt }, { entry, from, fp }) => ({
  id,
  kind: entry.kind,
  name: entry.name,
  from,
  fp,
  receivedAt,
  expiresAt: entry.expiresAt
})
