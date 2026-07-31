// What a saved-diff row leads with (the type monogram) and what it shows as
// tags. Pure so the "Untagged" decision is testable — it used to live inline in
// SavedDiffRow.vue, where nothing exercised it.
import { isMappedLanguage } from './languageMonogram'

// Entries saved before `format` existed lack the key entirely; ones saved since
// always carry it, null included (a pasted diff has no filename to read a format
// from). Presence, not truthiness, is what separates the two.
const isLegacy = (entry) => !(entry != null && 'format' in entry)

/**
 * The row's type key: the recorded format, or — for a legacy entry — a
 * format-shaped tag, so an old row still gets a real monogram instead of TXT.
 * @param {import('../types').VaultEntry} entry
 * @returns {string|null}
 */
export function rowFormatKey(entry) {
  if (!isLegacy(entry)) return entry.format || null
  return (entry?.tags || []).find(isMappedLanguage) || null
}

/**
 * Tags worth showing: the entry's own, minus the "imported" auto-tag (the
 * External section already says so). Only a legacy entry's format tag is
 * dropped, since the monogram it drives was inferred FROM that tag. Nothing
 * else is filtered — saving no longer injects the format into `tags`, so a tag
 * matching the format is one the user chose, and hiding it made the row claim
 * "Untagged" while carrying a tag.
 * @param {import('../types').VaultEntry} entry
 * @returns {string[]}
 */
export function rowTags(entry) {
  const tags = (entry?.tags || []).filter((t) => t !== 'imported')
  if (!isLegacy(entry)) return tags
  const legacy = rowFormatKey(entry)
  return legacy ? tags.filter((t) => t !== legacy) : tags
}
