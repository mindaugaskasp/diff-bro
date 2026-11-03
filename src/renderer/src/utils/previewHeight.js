export const PREVIEW_H = 180
export const PREVIEW_MIN = 120
// The editor above keeps at least 30% of the column.
const MAX_SHARE = 0.7

/**
 * @param {number|string} px
 * @param {number} space  height of the column the preview shares with the editor
 * @returns {number}
 */
export function clampPreviewHeight(px, space) {
  const n = Math.round(Number(px))
  if (!Number.isFinite(n)) return PREVIEW_H
  const max = Math.max(PREVIEW_MIN, Math.floor(space * MAX_SHARE))
  return Math.max(PREVIEW_MIN, Math.min(max, n))
}

/** @param {string|null} raw @returns {number} */
export function readPreviewHeight(raw) {
  try {
    return clampPreviewHeight(JSON.parse(raw ?? '{}')?.height ?? PREVIEW_H, Infinity)
  } catch {
    return PREVIEW_H
  }
}
