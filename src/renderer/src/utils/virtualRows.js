// Which slice of a long row list is worth putting in the DOM. Pure: no Vue, no
// element — the composable feeds it measurements and renders what it returns.
//
// Every row must be the SAME height for this to be exact. That is a real
// constraint on the viewers, not an implementation detail: a row that wraps
// makes the padding lie and the list jumps as you scroll.

// The one place the row heights live. Each viewer binds its own CSS variable
// from these, so the arithmetic and the layout cannot drift apart.
export const SD_ROW_H = 22
export const GRID_ROW_H = 24

// Rows kept beyond each edge, so a fast scroll doesn't reach blank space before
// the next frame lands.
export const OVERSCAN = 8

// Before the first layout there is nothing to measure, and rendering "all of
// them" at that moment is exactly the freeze this exists to prevent.
const UNMEASURED_ROWS = 60

/**
 * @param {{ total: number, rowHeight: number, scrollTop: number,
 *           viewportHeight: number, overscan?: number }} o
 * @returns {{ start: number, end: number, padTop: number, padBottom: number }}
 */
export function rowWindow({ total, rowHeight, scrollTop, viewportHeight, overscan = OVERSCAN }) {
  const count = Math.max(0, Math.floor(total) || 0)
  if (!(rowHeight > 0) || !count) return { start: 0, end: count, padTop: 0, padBottom: 0 }
  if (!(viewportHeight > 0)) {
    const end = Math.min(count, UNMEASURED_ROWS)
    return { start: 0, end, padTop: 0, padBottom: (count - end) * rowHeight }
  }
  const top = Math.min(Math.max(scrollTop || 0, 0), count * rowHeight)
  const start = Math.max(0, Math.floor(top / rowHeight) - overscan)
  const end = Math.min(count, start + Math.ceil(viewportHeight / rowHeight) + overscan * 2)
  return { start, end, padTop: start * rowHeight, padBottom: (count - end) * rowHeight }
}
