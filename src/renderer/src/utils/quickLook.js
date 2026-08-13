import { isSecret } from './secretSnippet'

// Ranking and row construction for the quick look-up. The scoring bands mirror
// useSnippetFilters' text match so the two search surfaces agree on what a query
// finds. The footer hint tables are next door in quickLookHints.js.

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

const TOOLS_ID = '__tools__'
const CREATE_ID = '__create__'

/**
 * The snippet library as launcher rows, newest first. `languageOf` is passed in
 * because it lives in the store and utils/ may not reach one.
 * @param {object[]} entries
 * @param {(entry: object) => string} languageOf
 * @returns {QuickLookItem[]}
 */
export const snippetRows = (entries, languageOf) =>
  entries
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((e) => {
      const lang = languageOf(e)
      return {
        kind: 'snippet',
        id: e.id,
        name: e.name,
        tags: e.tags ?? [],
        secret: isSecret(e),
        // The launcher lists the same snippet, so it wears the same colour.
        color: e.color ?? null,
        // What is stored ('auto' or an explicit id) — an inline edit must save
        // this back, never the resolved value below.
        language: e.language,
        // For display only: plaintext shows no monogram.
        lang: lang === 'plaintext' ? '' : lang
      }
    })

/**
 * Every row the launcher lists, in order. The create row is LAST: the selection
 * should stay on the best match, and Cmd/Ctrl+N is the fast path from anywhere,
 * so this row is for discovery and the mouse rather than the hurry.
 * @param {{query: string, matchedTools: QuickLookItem[], snippets: QuickLookItem[], toolsOpen: boolean}} o
 * @returns {QuickLookItem[]}
 */
export function resultRows({ query, matchedTools, snippets, toolsOpen }) {
  const rows = []
  if (matchedTools.length) {
    rows.push({
      kind: 'tools',
      id: TOOLS_ID,
      nameKey: 'quickLook.toolsHeader',
      count: matchedTools.length
    })
    if (toolsOpen) rows.push(...matchedTools)
  }
  rows.push(...rank(query, snippets))
  const named = String(query ?? '').trim()
  if (named) rows.push({ kind: 'create', id: CREATE_ID, name: named })
  return rows
}
