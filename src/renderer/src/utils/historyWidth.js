// How wide the snippet history panel may be dragged. Pure, so the bounds are
// testable without a pointer.

export const HISTORY_W = 440
export const HISTORY_MIN = 320
// The snippet beside it stays the larger of the two.
const MAX_SHARE = 0.6

/**
 * @param {number|string} px
 * @param {number} space  width of the area the panel shares with the snippet
 * @returns {number}
 */
export function clampHistoryWidth(px, space) {
  const n = Math.round(Number(px))
  if (!Number.isFinite(n)) return HISTORY_W
  const max = Math.max(HISTORY_MIN, Math.floor(space * MAX_SHARE))
  return Math.max(HISTORY_MIN, Math.min(max, n))
}

/** @param {string|null} raw @returns {number} */
export function readHistoryWidth(raw) {
  try {
    return clampHistoryWidth(JSON.parse(raw ?? '{}')?.width ?? HISTORY_W, Infinity)
  } catch {
    return HISTORY_W
  }
}
