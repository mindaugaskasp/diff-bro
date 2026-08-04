// How wide the sidebar may be dragged. Pure so the bounds are testable without
// a pointer: the composable owns the drag, this owns the rule.

/** The designed width, and the floor — the sidebar widens, it never narrows. */
export const SIDEBAR_W = 256
/**
 * Half again and no further. Past that the comparison — what the window is
 * actually for — loses more than a longer snippet name gains, and the sidebar
 * is already collapsible for anyone who wants the space back the other way.
 */
export const SIDEBAR_MAX = Math.round(SIDEBAR_W * 1.5)

/** @param {number|string} px @returns {number} */
export function clampSidebarWidth(px) {
  const n = Math.round(Number(px))
  if (!Number.isFinite(n)) return SIDEBAR_W
  return Math.max(SIDEBAR_W, Math.min(SIDEBAR_MAX, n))
}

/**
 * The stored width, or the default. A hand-edited file cannot widen the sidebar
 * past the cap or collapse it to nothing.
 * @param {string|null} raw
 */
export function readSidebarWidth(raw) {
  try {
    return clampSidebarWidth(JSON.parse(raw ?? '{}')?.width)
  } catch {
    return SIDEBAR_W
  }
}
