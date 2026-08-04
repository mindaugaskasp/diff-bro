// Spotlight geometry: where the callout goes, and the path that cuts the
// target out of the veil. Pure — the composable measures, this decides.

/** Callout width, shared with the stylesheet via --tour-callout-w. */
export const CALLOUT_W = 296
/** Gap between the target and a callout beside it. */
export const CALLOUT_GAP = 13
/** Inset for a callout placed INSIDE a zone target. */
const ZONE_INSET = 14

const clamp = (v, lo, hi) => Math.max(lo, Math.min(Math.max(lo, hi), v))

/**
 * Place the callout: the requested side, then its opposite, then the other
 * axis. That last fallback is not theoretical — a target wider than the space
 * either side of it (the quick look-up panel) otherwise lands off-stage.
 *
 * @param {{ box: object, side: string, stage: object, calloutH: number, zone?: boolean }} args
 * @returns {{ x: number, y: number }}
 */
// Preference order per requested side: itself, its opposite, then the other
// axis. The third stage is what stops a target wider than the space either
// side of it from pushing the callout off-stage.
const ORDER = {
  bottom: ['below', 'above', 'right', 'left'],
  top: ['above', 'below', 'right', 'left'],
  right: ['right', 'left', 'below', 'above'],
  left: ['left', 'right', 'below', 'above']
}

function candidates(box, stage, calloutH) {
  const midX = clamp(box.x + box.w / 2 - CALLOUT_W / 2, 0, stage.w - CALLOUT_W)
  const midY = clamp(box.y + box.h / 2 - calloutH / 2, 0, stage.h - calloutH)
  return {
    below: { x: midX, y: box.y + box.h + CALLOUT_GAP },
    above: { x: midX, y: box.y - calloutH - CALLOUT_GAP },
    right: { x: box.x + box.w + CALLOUT_GAP, y: midY },
    left: { x: box.x - CALLOUT_W - CALLOUT_GAP, y: midY }
  }
}

const onStage = (pos, stage, calloutH) =>
  pos.x >= 0 && pos.y >= 0 && pos.x + CALLOUT_W <= stage.w && pos.y + calloutH <= stage.h

export function placeCallout({ box, side, stage, calloutH, zone = false }) {
  // A zone fills its pane, so there is no "beside" — sit inside it instead.
  if (zone) {
    return {
      x: clamp(box.x + box.w - CALLOUT_W - ZONE_INSET, 0, stage.w - CALLOUT_W),
      y: clamp(box.y + ZONE_INSET, 0, stage.h - calloutH)
    }
  }
  const spots = candidates(box, stage, calloutH)
  const order = ORDER[side] ?? ORDER.bottom
  const fitting = order.map((name) => spots[name]).find((p) => onStage(p, stage, calloutH))
  if (fitting) return fitting
  const first = spots[order[0]]
  return {
    x: clamp(first.x, 0, stage.w - CALLOUT_W),
    y: clamp(first.y, 0, stage.h - calloutH)
  }
}

/**
 * An evenodd clip path: the whole stage, with the target cut out as a rounded
 * rectangle. ONE layer, so the scrim can never overlap itself — patching a
 * rectangular hole's corners with a second scrim element double-darkens where
 * the two meet, which reads as a heavy rim around the ring.
 *
 * @param {{ box: object, stage: object, radius?: number }} args
 * @returns {string} path data for `clip-path: path(evenodd, …)`
 */
export function holePath({ box, stage, radius = 6 }) {
  const w = Math.max(0, box.w)
  const h = Math.max(0, box.h)
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  const n = (v) => Math.round(v * 100) / 100
  const [x, y] = [n(box.x), n(box.y)]
  const [x2, y2] = [n(box.x + w), n(box.y + h)]
  const hole =
    `M${n(x + r)},${y} H${n(x2 - r)} A${n(r)},${n(r)} 0 0 1 ${x2},${n(y + r)}` +
    ` V${n(y2 - r)} A${n(r)},${n(r)} 0 0 1 ${n(x2 - r)},${y2}` +
    ` H${n(x + r)} A${n(r)},${n(r)} 0 0 1 ${x},${n(y2 - r)}` +
    ` V${n(y + r)} A${n(r)},${n(r)} 0 0 1 ${n(x + r)},${y} Z`
  return `M0,0 H${n(stage.w)} V${n(stage.h)} H0 Z ${hole}`
}

/**
 * The four blur rectangles around the hole. Separate from the tint because
 * Chromium resolves `backdrop-filter` BEFORE `clip-path`, so a clipped blur
 * layer blurs straight through its own hole; rectangles leave unblurred corner
 * slivers instead, which are imperceptible.
 *
 * @returns {{ left: number, top: number, width: number, height: number }[]}
 */
export function blurPanels({ box, stage }) {
  const right = box.x + box.w
  const bottom = box.y + box.h
  const size = (v) => Math.max(0, v)
  return [
    { left: 0, top: 0, width: stage.w, height: size(box.y) },
    { left: 0, top: bottom, width: stage.w, height: size(stage.h - bottom) },
    { left: 0, top: box.y, width: size(box.x), height: size(box.h) },
    { left: right, top: box.y, width: size(stage.w - right), height: size(box.h) }
  ]
}
