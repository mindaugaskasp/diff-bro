// Pure ranking for the quick look-up. The scoring bands mirror useSnippetFilters'
// text match so the two search surfaces agree on what a query finds.

/** @typedef {import('../types').QuickLookItem} QuickLookItem */

const norm = (s) =>
  String(s ?? '')
    .trim()
    .toLowerCase()

// Lower score = stronger match; NO_MATCH drops the item. An empty query scores
// every item 0, so the list returns in the caller's order untouched.
export const NO_MATCH = 99

/**
 * @param {string} query
 * @param {QuickLookItem} item
 * @returns {number} 0 (best) … 3, or NO_MATCH
 */
export function scoreItem(query, item) {
  const q = norm(query)
  if (!q) return 0
  const name = norm(item?.name)
  if (name.startsWith(q)) return 0
  if (name.includes(q)) return 1
  if ((item?.tags ?? []).some((t) => norm(t).includes(q))) return 2
  if (norm(item?.lang).includes(q)) return 3
  return NO_MATCH
}

/**
 * @param {string} query
 * @param {QuickLookItem[]} items
 * @returns {QuickLookItem[]} matches, best first; ties keep input order
 */
export function rank(query, items) {
  const scored = (items ?? [])
    .map((item, i) => ({ item, s: scoreItem(query, item), i }))
    .filter((x) => x.s < NO_MATCH)
  scored.sort((a, b) => a.s - b.s || a.i - b.i)
  return scored.map((x) => x.item)
}
