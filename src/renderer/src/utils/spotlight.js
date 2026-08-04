// Spotlight geometry: where the callout goes, and the path that cuts the
// target out of the veil. Pure — the composable measures, this decides.

/** Callout width, shared with the stylesheet via --tour-callout-w. */
export const CALLOUT_W = 296
/** Gap between the target and a callout beside it. */
export const CALLOUT_GAP = 13
/** Inset for a callout placed INSIDE a zone target. */
const ZONE_INSET = 14
/** How far an AREA stroke is pulled off the edges of what it outlines. Flush,
 *  it doubles up with whatever that area sits against — the comparison pane
 *  butts straight onto the tab strip's own bottom border. */
const AREA_INSET = 4
/** Clear of the box it explains, and clear of the window's own edges. */
const NOTE_GAP = 8
const NOTE_EDGE = 12

// A context that CONTAINS the target is the surface the step is working inside,
// so the veil is cut around the whole of it: a hole over one row of a dialog
// reads as a lighter band pasted across it. A context BESIDE the target — the
// comparison the Share button seals — is stroked instead, and the veil over it
// softened so it stays readable.
const within = (outer, inner) =>
  !!outer &&
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h

// Whole pixels before the panels are cut from it. Each panel is rounded again
// on its way into a style, and rounding two shared edges independently is what
// left a hairline of un-blurred app between two backdrop-filter rectangles —
// visible the moment a hover repaint went through it.
const snap = (box) => ({
  x: Math.round(box.x),
  y: Math.round(box.y),
  w: Math.round(box.w),
  h: Math.round(box.h)
})

const shrink = (box, by) => ({
  x: box.x + by,
  y: box.y + by,
  w: Math.max(0, box.w - by * 2),
  h: Math.max(0, box.h - by * 2)
})

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

const NOWHERE = { x: 0, y: 0, w: 0, h: 0 }

// Nothing to point at: the card is centred, ringless, and the whole stage
// veiled. Rendering nothing at all left the tour active with no way out.
const unanchored = (stage, calloutH) => ({
  found: false,
  soft: false,
  context: null,
  box: NOWHERE,
  hole: NOWHERE,
  ring: NOWHERE,
  panels: [{ left: 0, top: 0, width: stage.w, height: stage.h }],
  clip: 'none',
  callout: {
    x: clamp((stage.w - CALLOUT_W) / 2, 0, stage.w - CALLOUT_W),
    y: clamp((stage.h - calloutH) / 2, 0, stage.h - calloutH)
  }
})

/**
 * Where the "not while the tour is running" label sits: on whichever edge of the
 * blocked box the card is NOT on. A bubble under the control landed straight on
 * top of the step's own words, which is why the shared tooltip was no good here.
 *
 * @returns {{ x: number, y: number, below: boolean }}
 */
export function placeBlockedNote({ box, callout, stage, calloutH }) {
  const below = callout.y + calloutH / 2 < box.y + box.h / 2
  const y = below ? box.y + box.h + NOTE_GAP : box.y - NOTE_GAP
  return {
    x: clamp(box.x + box.w / 2, NOTE_EDGE, stage.w - NOTE_EDGE),
    y: clamp(y, NOTE_EDGE, stage.h - NOTE_EDGE),
    below
  }
}

// What the veil cuts, what the ring marks, and whether the veil is softened
// rather than opened.
function anchors({ box, context, point, zone }) {
  const inside = within(context, box)
  return {
    ring: point ?? (zone ? shrink(box, AREA_INSET) : box),
    hole: inside ? context : box,
    soft: !!context && !inside
  }
}

/**
 * Everything the overlay draws for one step, from one measurement.
 *
 * `context` is the REGION a step is about when that is not the control it
 * points at; `point` is the control inside a target too large to ring.
 *
 * @param {{ box: object|null, context?: object|null, point?: object|null, side: string, stage: object, calloutH: number, zone?: boolean }} args
 */
export function spotlightFor({
  box,
  context = null,
  point = null,
  side,
  stage,
  calloutH,
  zone = false
}) {
  if (!box) return unanchored(stage, calloutH)
  const { ring, hole, soft } = anchors({ box, context, point, zone })
  const cut = snap(hole)
  return {
    found: true,
    context: context && shrink(context, AREA_INSET),
    soft,
    box,
    hole: cut,
    ring,
    panels: blurPanels({ box: cut, stage }),
    clip: `path(evenodd, "${holePath({ box: cut, stage })}")`,
    callout: placeCallout({ box: ring, side: side ?? 'bottom', stage, calloutH, zone })
  }
}
