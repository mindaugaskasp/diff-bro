// What the open tabs hold, in characters. Split from tabs.js as accounting
// rather than identity: a plain count charged a streamed pair holding nothing
// the same rent as two 200 MB files.

/** @typedef {import('./tabs').DiffTab} DiffTab */

// A rail, not the bound — the real ceiling is the budget below.
export const MAX_TABS = 16

export const MAX_LIVE_CHARS = 96_000_000

// A streamed side is a path, so it costs nothing to hold; a grid costs cells.
function sideCost(side) {
  if (!side || side.kind === 'streamed') return 0
  if (side.kind === 'spreadsheet') {
    return (side.sheets ?? []).reduce((n, s) => n + s.rows.length * (s.rows[0]?.length ?? 0), 0)
  }
  return side.content?.length ?? 0
}

/**
 * What one tab is holding, in characters.
 * @param {DiffTab} [tab]
 * @returns {number}
 */
export function tabCost(tab) {
  const s = tab?.snapshot ?? {}
  return (
    sideCost(s.left) +
    sideCost(s.right) +
    sideCost(s.pasteLeftFile) +
    sideCost(s.pasteRightFile) +
    (s.pasteLeft?.length ?? 0) +
    (s.pasteRight?.length ?? 0)
  )
}

/** @param {DiffTab[]} tabs */
export const tabsCost = (tabs) => (tabs ?? []).reduce((n, t) => n + tabCost(t), 0)

/** @param {DiffTab[]} tabs */
export const canAddTab = (tabs) => (tabs?.length ?? 0) < MAX_TABS && tabsCost(tabs) < MAX_LIVE_CHARS
