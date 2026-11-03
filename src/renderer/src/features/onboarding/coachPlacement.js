export const COACH_W = 300
const GAP = 14
const EDGE = 8
const POINTER_INSET = 18
const RIGHT_LEAD = 26

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

/**
 * Where a coach mark sits beside its target, and where along its edge the
 * pointer meets the target's centre. `bottom` points up; `right` points left.
 * @param {{ rect: import('../../types').ScreenRect, side?: string, height: number, stage: { w: number, h: number } }} args
 * @returns {{ left: number, top: number, pointer: 'up'|'left', offset: number }}
 */
export function coachPlacement({ rect, side, height, stage }) {
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  if (side === 'right') {
    const top = clamp(cy - RIGHT_LEAD, EDGE, Math.max(EDGE, stage.h - height - EDGE))
    const offset = clamp(cy - top, POINTER_INSET, Math.max(POINTER_INSET, height - POINTER_INSET))
    return { left: rect.x + rect.w + GAP, top, pointer: 'left', offset }
  }
  const left = clamp(cx - COACH_W / 2, EDGE, Math.max(EDGE, stage.w - COACH_W - EDGE))
  const offset = clamp(cx - left, POINTER_INSET, COACH_W - POINTER_INSET)
  return { left, top: rect.y + rect.h + GAP, pointer: 'up', offset }
}
