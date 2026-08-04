import { describe, expect, it } from 'vitest'
import {
  CALLOUT_W,
  holePath,
  placeBlockedNote,
  placeCallout,
  spotlightFor
} from '../../../src/renderer/src/utils/spotlight'

const stage = { w: 1000, h: 600 }
const box = (over = {}) => ({ x: 400, y: 300, w: 120, h: 30, ...over })

const inside = (pos, h) =>
  pos.x >= 0 && pos.y >= 0 && pos.x + CALLOUT_W <= stage.w && pos.y + h <= stage.h

describe('placeCallout', () => {
  it('puts a bottom-placed callout under the target, horizontally centred on it', () => {
    const pos = placeCallout({ box: box(), side: 'bottom', stage, calloutH: 150 })
    expect(pos.y).toBeGreaterThan(330)
    expect(pos.x + CALLOUT_W / 2).toBeCloseTo(460, 0)
  })

  it('flips to the opposite side when the requested one does not fit', () => {
    const target = box({ y: 540 })
    const pos = placeCallout({ box: target, side: 'bottom', stage, calloutH: 150 })
    // ABOVE the target, not merely shoved back on-stage: the clamp alone
    // satisfies "inside the stage", so that assertion proves nothing.
    expect(pos.y + 150).toBeLessThanOrEqual(target.y)
    expect(inside(pos, 150)).toBe(true)
  })

  it('falls back to the other axis when NEITHER side fits', () => {
    // The quick look-up regression: a 540-wide panel centred in a 1000-wide
    // stage leaves 230 either side — less than the callout's own width — so
    // both horizontal candidates are off-stage.
    const target = { x: 230, y: 60, w: 540, h: 300 }
    const pos = placeCallout({ box: target, side: 'left', stage, calloutH: 150 })
    // On the other axis and clear of the target — a clamped x would still be
    // >= 0 while sitting straight on top of what it points at.
    expect(pos.y).toBeGreaterThanOrEqual(target.y + target.h)
    expect(inside(pos, 150)).toBe(true)
  })

  it('never returns a negative x, whatever is asked of it', () => {
    for (const w of [100, 400, 700, 980]) {
      for (const side of ['left', 'right', 'top', 'bottom']) {
        const pos = placeCallout({
          box: { x: (stage.w - w) / 2, y: 40, w, h: 500 },
          side,
          stage,
          calloutH: 200
        })
        expect(pos.x, `${side} @ ${w}`).toBeGreaterThanOrEqual(0)
        expect(pos.y, `${side} @ ${w}`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('places a zone callout inside the target, clear of its edges', () => {
    const zone = { x: 200, y: 100, w: 700, h: 400 }
    const pos = placeCallout({ box: zone, side: 'left', stage, calloutH: 150, zone: true })
    expect(pos.x).toBeGreaterThan(zone.x)
    expect(pos.x + CALLOUT_W).toBeLessThanOrEqual(zone.x + zone.w)
    expect(pos.y).toBeGreaterThan(zone.y)
  })

  it('keeps a side callout clear of the target it points at', () => {
    const pos = placeCallout({ box: box(), side: 'right', stage, calloutH: 150 })
    expect(pos.x).toBeGreaterThanOrEqual(520)
  })
})

describe('spotlightFor', () => {
  it('anchors on the target when it is on screen', () => {
    const s = spotlightFor({ box: box(), side: 'bottom', stage, calloutH: 150 })
    expect(s.found).toBe(true)
    expect(s.clip).toContain('evenodd')
    expect(s.panels).toHaveLength(4)
  })

  // Flush against the pane it outlines, a dashed area stroke doubles up with
  // the border that pane already sits on — the tab strip's.
  it('pulls an area stroke off the edges it would otherwise double', () => {
    const pane = { x: 260, y: 40, w: 700, h: 500 }
    const s = spotlightFor({ box: box(), context: pane, side: 'bottom', stage, calloutH: 150 })
    expect(s.context.x).toBeGreaterThan(pane.x)
    expect(s.context.y).toBeGreaterThan(pane.y)
    expect(s.context.x + s.context.w).toBeLessThan(pane.x + pane.w)
    // A control's ring still hugs its own box — an offset there collides with
    // the accent underline the active tab already draws.
    expect(s.ring).toStrictEqual(box())
  })

  it('insets a zone ring the same way, while the hole stays on the target', () => {
    const pane = { x: 260, y: 40, w: 700, h: 500 }
    const s = spotlightFor({ box: pane, side: 'left', stage, calloutH: 150, zone: true })
    expect(s.ring.x).toBeGreaterThan(pane.x)
    expect(s.box).toStrictEqual(pane)
  })

  // A hole cut over one row of a dialog reads as a lighter band pasted across
  // it, so a context that CONTAINS the target opens the whole surface instead.
  it('opens the veil around a context the target sits inside', () => {
    const dialog = { x: 300, y: 100, w: 400, h: 400 }
    const row = { x: 320, y: 420, w: 360, h: 30 }
    const s = spotlightFor({ box: row, context: dialog, side: 'top', stage, calloutH: 150 })
    expect(s.hole).toStrictEqual(dialog)
    expect(s.ring).toStrictEqual(row)
    // Nothing to soften: the surface is open rather than veiled through.
    expect(s.soft).toBe(false)
  })

  it('softens the veil instead when the context sits BESIDE the target', () => {
    const pane = { x: 260, y: 200, w: 700, h: 300 }
    const button = { x: 800, y: 20, w: 80, h: 26 }
    const s = spotlightFor({ box: button, context: pane, side: 'bottom', stage, calloutH: 150 })
    expect(s.hole).toStrictEqual(button)
    expect(s.soft).toBe(true)
  })

  // The four blur rectangles share edges. Rounded independently on their way
  // into a style, two of those edges disagreed by a pixel and left a hairline of
  // un-blurred app between them — which a hover repaint made visible.
  it('cuts the veil on whole pixels so the blur panels leave no seam', () => {
    const s = spotlightFor({
      box: { x: 400.4, y: 300.6, w: 120.3, h: 30.7 },
      side: 'bottom',
      stage,
      calloutH: 150
    })
    const whole = (n) => Number.isInteger(n)
    for (const p of s.panels) {
      expect([p.left, p.top, p.width, p.height].every(whole), JSON.stringify(p)).toBe(true)
    }
    const [top, bottom, left, right] = s.panels
    expect(top.height).toBe(s.hole.y)
    expect(bottom.top).toBe(s.hole.y + s.hole.h)
    expect(left.top).toBe(s.hole.y)
    expect(right.top).toBe(s.hole.y)
    expect(left.height).toBe(s.hole.h)
  })

  // A step whose target is not on screen — a collapsed sidebar, a dialog that
  // did not open — used to render NOTHING while the tour stayed active: no
  // callout, no Next, no Skip, and no way out but Escape.
  it('still yields a readable overlay when the target is missing', () => {
    const s = spotlightFor({ box: null, side: 'bottom', stage, calloutH: 150 })
    expect(s.found).toBe(false)
    expect(s.clip).toBe('none')
    expect(s.panels).toEqual([{ left: 0, top: 0, width: stage.w, height: stage.h }])
    expect(inside(s.callout, 150)).toBe(true)
    expect(s.callout.x).toBeCloseTo((stage.w - CALLOUT_W) / 2, 0)
  })
})

describe('holePath', () => {
  it('cuts a rounded hole out of a full-stage rectangle', () => {
    const d = holePath({ box: box(), stage, radius: 6 })
    expect(d.startsWith('M0,0')).toBe(true)
    expect(d).toContain(`H${stage.w}`)
    expect(d).toContain(`V${stage.h}`)
    // Two subpaths: the outer rect and the hole.
    expect(d.match(/M/g)).toHaveLength(2)
    expect(d.match(/A/g)).toHaveLength(4)
  })

  it('places the hole at the target rect', () => {
    const d = holePath({ box: { x: 400, y: 300, w: 120, h: 30 }, stage, radius: 6 })
    expect(d).toContain('M406,300')
    expect(d).toContain('H514')
  })

  it('never lets the radius exceed half the smaller side', () => {
    const d = holePath({ box: { x: 0, y: 0, w: 10, h: 8 }, stage, radius: 6 })
    // radius clamps to 4, so the top edge run is 10 - 2*4 = 2 → H6 from x=4
    expect(d).toContain('M4,0')
    expect(d).toContain('H6')
  })

  it('survives a zero-sized target without emitting NaN', () => {
    const d = holePath({ box: { x: 0, y: 0, w: 0, h: 0 }, stage, radius: 6 })
    expect(d).not.toContain('NaN')
  })
})

// The card sits beside the control it rings, so a note under that control lands
// on the card. It goes on whichever edge the card is not on.
describe('placeBlockedNote', () => {
  const blocked = { x: 400, y: 300, w: 120, h: 30 }

  it('sits below the box when the card is above it', () => {
    const note = placeBlockedNote({
      box: blocked,
      callout: { x: 400, y: 120 },
      stage,
      calloutH: 150
    })
    expect(note.below).toBe(true)
    expect(note.y).toBeGreaterThan(blocked.y + blocked.h)
  })

  it('sits above the box when the card is below it', () => {
    const note = placeBlockedNote({
      box: blocked,
      callout: { x: 400, y: 380 },
      stage,
      calloutH: 150
    })
    expect(note.below).toBe(false)
    expect(note.y).toBeLessThan(blocked.y)
  })

  it('stays on stage for a box against an edge', () => {
    const note = placeBlockedNote({
      box: { x: 0, y: 0, w: 40, h: 20 },
      callout: { x: 300, y: 300 },
      stage,
      calloutH: 150
    })
    expect(note.x).toBeGreaterThan(0)
    expect(note.y).toBeGreaterThan(0)
  })
})
