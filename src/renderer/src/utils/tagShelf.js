// The sidebar tag shelf: what a dragged height is worth in rows, and how many
// chips of measured width fit in them. Pure — the composable measures the DOM,
// the arithmetic lives here.
//
// The depth is a HEIGHT rather than a count of chips because a chip is as wide
// as its name: four-per-row was a guess that made one row of pointer travel
// worth anything between half a rendered row and two. TAG_ROW_PX is only the
// fallback — the shelf measures the real row.
export const TAG_ROW_PX = 21
export const MIN_TAG_SHELF_PX = TAG_ROW_PX
export const DEFAULT_TAG_SHELF_PX = TAG_ROW_PX * 3
export const MAX_TAG_SHELF_PX = 2000

// A settings file written before the depth became a height still holds
// tagShelfRows. Two was that setting's FLOOR as well as its default, so a stored
// two carries no choice to keep — anything deeper does, one row for one row.
const LEGACY_DEFAULT_ROWS = 2
export function migratedShelfHeight(parsed) {
  if (parsed.tagShelfHeight !== undefined) return parsed.tagShelfHeight
  const rows = Number(parsed.tagShelfRows)
  if (!Number.isFinite(rows)) return undefined
  return rows > LEGACY_DEFAULT_ROWS ? rows * TAG_ROW_PX : DEFAULT_TAG_SHELF_PX
}

// N rows occupy `N*rowStep - gap` — the last row has no gap under it — so the
// gap comes back before the division.
const rowsIn = (height, rowStep, gap) => (Number(height) + gap) / rowStep

/**
 * Whole rows a shelf that tall HOLDS. Floored, never rounded: a row the height
 * cannot pay for in full is a row of chips clipped at the bottom edge.
 * @param {number} height  the shelf's height in px
 * @param {number} rowStep  a chip's height plus the gap
 * @param {number} gap
 * @returns {number} at least 1
 */
export function rowsThatFit(height, rowStep, gap) {
  if (!(rowStep > 0)) return 1
  return Math.max(1, Math.floor(rowsIn(height, rowStep, gap)))
}

/**
 * The row a dragged height is NEAREST — what the seam snaps to under the hand,
 * where landing on the closer row is what feels 1:1.
 * @returns {number} at least 1
 */
export function nearestRows(height, rowStep, gap) {
  if (!(rowStep > 0)) return 1
  return Math.max(1, Math.round(rowsIn(height, rowStep, gap)))
}

/**
 * The height a shelf exactly this deep takes — the inverse of the two above,
 * so a drag can land on whole rows instead of clipping one.
 * @returns {number}
 */
export const shelfHeight = (rows, rowStep, gap) => Math.max(1, Math.round(rows * rowStep - gap))

// Flex-wrap, in arithmetic: a chip too wide for the row it starts still takes
// that row rather than vanishing.
function fitsIn(widths, { available, gap, rows }) {
  let row = 1
  let x = 0
  for (const w of widths) {
    const next = x === 0 ? w : x + gap + w
    if (next <= available || x === 0) {
      x = next
      continue
    }
    row += 1
    x = w
    if (row > rows) return false
  }
  return row <= rows
}

/**
 * How many of `widths` the shelf shows — every one of them when they all fit,
 * otherwise as many as leave room for the "+N more" chip on the last row.
 * @param {number[]} widths  measured chip widths, in display order
 * @param {{available:number, gap:number, rows:number, trigger:number}} box
 * @returns {number}
 */
export function chipsThatFit(widths, box) {
  const list = widths ?? []
  if (fitsIn(list, box)) return list.length
  for (let n = list.length - 1; n > 0; n -= 1) {
    if (fitsIn([...list.slice(0, n), box.trigger], box)) return n
  }
  return 0
}

/**
 * Selected tags first, whatever their count: a filter you cannot see is worse
 * than one you cannot reach, and rank alone would hide your own choice behind
 * "+42 more".
 * @param {{name: string}[]} all
 * @param {string[]} active
 * @returns {{name: string}[]}
 */
export const orderedTags = (all, active) => [
  ...(all ?? []).filter((t) => active?.includes(t.name)),
  ...(all ?? []).filter((t) => !active?.includes(t.name))
]
