// Zoom for the COMPARISON, not for the app. Chromium's own scaled the whole
// window, toolbar and sidebar included, which is what made the bar run out of
// room. Pure: the stores hold the level, the views turn it into a size.

/** Zoom levels, as multipliers. 1 is unzoomed and is always in the ladder. */
export const ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]
export const ZOOM_DEFAULT = 1

/**
 * The next level in a direction, clamped at both ends of the ladder.
 *
 * @param {number} current
 * @param {number} direction +1 in, -1 out, 0 resets
 * @returns {number} a level from ZOOM_STEPS
 */
export function steppedZoom(current, direction) {
  if (!direction) return ZOOM_DEFAULT
  // An unknown level (a stale persisted value) snaps to the nearest rung rather
  // than falling off the ladder.
  const nearest = ZOOM_STEPS.reduce((best, step) =>
    Math.abs(step - current) < Math.abs(best - current) ? step : best
  )
  const at = ZOOM_STEPS.indexOf(nearest)
  const next = at + (direction > 0 ? 1 : -1)
  return ZOOM_STEPS[Math.min(Math.max(next, 0), ZOOM_STEPS.length - 1)]
}

/** Whether a further step in this direction would change anything. */
export const canZoom = (current, direction) => steppedZoom(current, direction) !== current

/**
 * A base size at a zoom level, rounded to whole pixels — Monaco lays out on
 * integer font sizes and a fractional one shimmers between rows.
 *
 * @param {number} base px at zoom 1
 * @param {number} zoom
 */
export const zoomedPx = (base, zoom) => Math.round(base * zoom)

/** How the level reads in the UI. */
export const zoomLabel = (zoom) => `${Math.round(zoom * 100)}%`
