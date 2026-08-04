import { describe, expect, it } from 'vitest'
import { CALLOUT_W, holePath, placeCallout } from '../../../src/renderer/src/utils/spotlight'

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
