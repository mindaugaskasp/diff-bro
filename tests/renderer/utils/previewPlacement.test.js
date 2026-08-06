import { describe, expect, it } from 'vitest'
import { previewCardPosition } from '../../../src/renderer/src/utils/previewPlacement'

const WIDTH = 640
const viewport = { width: 1400, height: 900 }
const at = (left, right, top = 100) => ({ left, right, top })
const leftPx = (style) => Number.parseInt(style.left, 10)

describe('previewCardPosition', () => {
  it('sits just right of the row when there is room', () => {
    const style = previewCardPosition({ rect: at(0, 256), viewport, width: WIDTH })
    expect(leftPx(style)).toBe(264)
  })

  it('flips to the left of the row when the right would overflow', () => {
    // A row far to the right: 1100 + 8 + 640 runs off, and there IS room at 452.
    const style = previewCardPosition({ rect: at(1100, 1300), viewport, width: WIDTH })
    expect(leftPx(style)).toBe(1100 - WIDTH - 8)
  })

  // The bug. Widen the sidebar and the row still starts near x=0, so the flip
  // computed a NEGATIVE left, `Math.max(8, …)` clamped it to the margin, and the
  // card covered the very list it was previewing — from its left edge.
  //
  // With a sidebar this wide there is nowhere the card does not touch it, so the
  // invariant is "as far right as it goes", not "no overlap": the tail of the
  // row is covered instead of the whole thing.
  it('is pushed to the far edge, not back over the row, when neither side fits', () => {
    const rect = at(0, 780) // a sidebar dragged wide
    const style = previewCardPosition({ rect, viewport, width: WIDTH })
    expect(leftPx(style)).toBe(viewport.width - WIDTH - 8)
    expect(leftPx(style)).toBeGreaterThan(8) // what the old clamp produced
  })

  // The case that matters in practice: a sidebar wide enough to trigger the flip
  // but not wide enough to make overlap unavoidable.
  it('clears the row entirely once there is room to', () => {
    const rect = at(0, 600)
    const style = previewCardPosition({ rect, viewport, width: WIDTH })
    expect(leftPx(style)).toBeGreaterThanOrEqual(rect.right)
  })

  it('stays inside the viewport on the right', () => {
    const style = previewCardPosition({ rect: at(0, 780), viewport, width: WIDTH })
    expect(leftPx(style) + WIDTH).toBeLessThanOrEqual(viewport.width)
  })

  it('keeps a tall card on screen rather than running off the bottom', () => {
    const style = previewCardPosition({ rect: at(0, 256, 800), viewport, width: WIDTH })
    expect(Number.parseInt(style.top, 10)).toBe(900 - 480)
  })

  it('does not push the top negative in a short window', () => {
    const style = previewCardPosition({
      rect: at(0, 256, 10),
      viewport: { width: 1400, height: 300 },
      width: WIDTH
    })
    expect(Number.parseInt(style.top, 10)).toBeGreaterThanOrEqual(8)
  })

  it('never returns a negative left, even when the card is wider than the window', () => {
    const style = previewCardPosition({
      rect: at(0, 300),
      viewport: { width: 500, height: 900 },
      width: WIDTH
    })
    expect(leftPx(style)).toBeGreaterThanOrEqual(8)
  })
})
