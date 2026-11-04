export const COACH_W = 300
const GAP = 14
const EDGE = 8
const POINTER_INSET = 18
const RIGHT_LEAD = 26
// Past a typed line like the Snippets tour's sample, so the mark never covers it.
const INSIDE_LEAD = 420

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

function insidePlacement(rect) {
  const lead = clamp(rect.x + INSIDE_LEAD, rect.x + EDGE, rect.x + rect.w - COACH_W - GAP)
  return { left: lead, top: rect.y + EDGE, pointer: 'left', offset: POINTER_INSET }
}

// Low in the zone, clear of the drop slot and hint a pane centres for itself.
function zonePlacement(rect, height) {
  const left = rect.x + (rect.w - COACH_W) / 2
  return { left, top: rect.y + (rect.h * 3) / 4 - height / 2, pointer: 'none', offset: 0 }
}

/**
 * Where a coach mark sits beside its target, and where along its edge the
 * pointer meets the target's centre. `bottom` points up; `top` points down; `right` points left;
 * `inside` sits in a wide target beside its first line; `zone` sits low in a
 * drop zone with no pointer.
 * @param {{ rect: import('../../types').ScreenRect, side?: string, height: number, stage: { w: number, h: number } }} args
 * @returns {{ left: number, top: number, pointer: 'up'|'down'|'left'|'none', offset: number }}
 */
export function coachPlacement({ rect, side, height, stage }) {
  if (side === 'inside') return insidePlacement(rect)
  if (side === 'zone') return zonePlacement(rect, height)
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  if (side === 'right') {
    const top = clamp(cy - RIGHT_LEAD, EDGE, Math.max(EDGE, stage.h - height - EDGE))
    const offset = clamp(cy - top, POINTER_INSET, Math.max(POINTER_INSET, height - POINTER_INSET))
    return { left: rect.x + rect.w + GAP, top, pointer: 'left', offset }
  }
  const left = clamp(cx - COACH_W / 2, EDGE, Math.max(EDGE, stage.w - COACH_W - EDGE))
  const offset = clamp(cx - left, POINTER_INSET, COACH_W - POINTER_INSET)
  if (side === 'top') return { left, top: rect.y - height - GAP, pointer: 'down', offset }
  return { left, top: rect.y + rect.h + GAP, pointer: 'up', offset }
}
