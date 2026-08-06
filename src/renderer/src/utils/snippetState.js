// The pure half of the snippet library: the tag registry's arithmetic and the
// migration from the legacy categories shape. No Vue, no Pinia, no persistence —
// so the migration can be unit-tested against a literal, which is what it is.

// 20 colours, evenly spaced around the OKLCH hue wheel at one lightness and
// chroma, interleaved so two tags made in a row land on opposite sides.
// The previous set had 20 entries but only ~8 distinct hues (three greens within
// 3 deg, three reds within 2), which the ink normalisation in ui.css then made
// indistinguishable. A new tag takes the next unused colour, then cycles.
export const TAG_PALETTE = [
  '#e9687e',
  '#c18f00',
  '#18b46d',
  '#00a7d8',
  '#a87eeb',
  '#ea6c5a',
  '#aa9a00',
  '#00b292',
  '#299ff4',
  '#c075d7',
  '#e57431',
  '#8ca507',
  '#00afab',
  '#6594fa',
  '#d46ebd',
  '#d68200',
  '#62ae45',
  '#00abc0',
  '#8a89f7',
  '#e1699f'
]

// Per-entry tag cap (one slot is often the auto-added format tag).
export const MAX_TAGS = 20

export const cleanTag = (name) =>
  String(name ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 40)

// Next unused palette color; cycles once every color is taken.
export function nextColor(tags) {
  const used = new Set(Object.values(tags).map((t) => t.color))
  return (
    TAG_PALETTE.find((c) => !used.has(c)) ??
    TAG_PALETTE[Object.keys(tags).length % TAG_PALETTE.length]
  )
}

// Monotonic recency rank (higher = more recent), derived from stored ranks.
export function nextRank(tags) {
  const ranks = Object.values(tags).map((t) => t.rank)
  return (ranks.length ? Math.max(...ranks) : 0) + 1
}

export const dropTag = (entries, name) => {
  for (const e of entries ?? []) {
    const i = e.tags?.indexOf(name) ?? -1
    if (i > -1) e.tags.splice(i, 1)
  }
}

// The explicit language, else whatever detection found: 'auto' is a request to
// detect, not a language. Shared by languageOf, formatTagFor and add().
export const effectiveLanguage = (language, detected) =>
  language && language !== 'auto' ? language : detected

const isTagShape = (parsed) =>
  !!parsed && !!parsed.tags && Array.isArray(parsed.entries) && !parsed.categories

// Every non-default category becomes a tag of the same name.
function tagsFromCategories(categories) {
  const tags = {}
  for (const c of categories) {
    if (c.isDefault) continue
    const n = cleanTag(c.name)
    if (n && !tags[n]) tags[n] = { color: nextColor(tags), rank: nextRank(tags) }
  }
  return tags
}

// Coerce name/tags so old/partial data can't throw the sidebar's unguarded field
// access (not in the AAD, so decryption is unaffected). `untitled` is passed in
// rather than translated here: utils never calls t().
const entryName = (e, untitled) =>
  typeof e?.name === 'string' ? e.name : String(e?.name ?? untitled)
const entryTags = (e) => (Array.isArray(e?.tags) ? e.tags.filter((t) => typeof t === 'string') : [])

function normalizeEntry(e, untitled) {
  return {
    ...e,
    // Pre-existing snippets have never been edited, so they date from creation.
    updatedAt: Number.isFinite(e?.updatedAt) ? e.updatedAt : e?.createdAt,
    name: entryName(e, untitled),
    // Only a real `true` masks: a hand-edited store must not be able to unmask a
    // secret with a missing field, nor mask one with a stray truthy value.
    secret: e?.secret === true,
    tags: entryTags(e)
  }
}

/**
 * Migrate the legacy categories shape to tags. The AAD keeps aadSalt = the old
 * categoryId, so existing ciphertext still decrypts — a metadata-only reshape.
 * @param {object|null} parsed  the parsed store file, or null
 * @param {string} untitled     already-translated fallback name
 */
export function migrate(parsed, untitled) {
  if (isTagShape(parsed)) {
    return {
      tags: typeof parsed.tags === 'object' && parsed.tags ? parsed.tags : {},
      entries: (Array.isArray(parsed.entries) ? parsed.entries : []).map((e) =>
        normalizeEntry(e, untitled)
      )
    }
  }
  const categories = Array.isArray(parsed?.categories) ? parsed.categories : []
  const catById = new Map(categories.map((c) => [c.id, c]))
  const entries = (Array.isArray(parsed?.entries) ? parsed.entries : []).map((e) => {
    const cat = catById.get(e.categoryId)
    const tagName = cat && !cat.isDefault ? cleanTag(cat.name) : null
    const { categoryId, ...rest } = e
    return normalizeEntry(
      { ...rest, aadSalt: categoryId, tags: tagName ? [tagName] : [] },
      untitled
    )
  })
  return { tags: tagsFromCategories(categories), entries }
}
