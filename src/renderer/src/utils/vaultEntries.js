// The pure half of the saved-diff store: what a stored entry is coerced into on
// read, and the format tag a row's monogram is drawn from. No Vue, no Pinia.

const EXT_TAG = { yml: 'yaml', htm: 'html', md: 'markdown', xlsx: 'excel', txt: null, text: null }

export function diffFormatTag(payload) {
  const extOf = (f) => /\.([a-z0-9]+)$/i.exec(f?.name ?? '')?.[1]?.toLowerCase() ?? null
  const raw = extOf(payload?.left) ?? extOf(payload?.right)
  if (!raw) return null
  const tag = raw in EXT_TAG ? EXT_TAG[raw] : raw
  return tag || null
}

// Who a diff was sealed for, and when. LOCAL ONLY, by construction: sealEntry
// is handed { name, createdAt, expiresAt, snapshot, tags } and never the entry
// itself, so this cannot travel inside a share — which matters, because it is a
// list of who else you sent something to.
//
// Only the fingerprint is kept. Labels are resolved live from the trust store,
// so renaming a key renames it here too, and removing one leaves the record
// honest rather than stale.
export function readSharedTo(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r) => typeof r?.fp === 'string' && r.fp)
    .map((r) => ({ fp: r.fp, at: Number.isFinite(r.at) ? r.at : 0 }))
}

/**
 * Tolerates the legacy category shape and the even older bare-array shape.
 * `untitled` is passed in rather than translated here: utils never calls t().
 * @param {string|null} raw   the persisted store file
 * @param {string} untitled   already-translated fallback name
 */
export function readEntries(raw, untitled) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.entries)
        ? parsed.entries
        : []
    return list.map((e) => {
      // Coerce name/tags so old data can't throw downstream (not in the AAD, so
      // decryption is unaffected).
      const clean = {
        ...e,
        name: typeof e?.name === 'string' ? e.name : String(e?.name ?? untitled),
        tags: Array.isArray(e.tags) ? e.tags.filter((t) => typeof t === 'string') : [],
        sharedTo: readSharedTo(e.sharedTo)
      }
      delete clean.categoryId
      return clean
    })
  } catch {
    return []
  }
}
