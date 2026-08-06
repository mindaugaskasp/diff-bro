import { describe, expect, it } from 'vitest'
import {
  ZOOM_DEFAULT,
  ZOOM_STEPS,
  canZoom,
  steppedZoom,
  zoomLabel,
  zoomedPx
} from '../../../src/renderer/src/utils/diffZoom'

describe('steppedZoom', () => {
  it('walks the ladder one rung at a time', () => {
    expect(steppedZoom(1, 1)).toBe(1.1)
    expect(steppedZoom(1.1, 1)).toBe(1.25)
    expect(steppedZoom(1, -1)).toBe(0.9)
  })

  it('clamps at both ends rather than running away', () => {
    const [min] = ZOOM_STEPS
    const max = ZOOM_STEPS.at(-1)
    expect(steppedZoom(min, -1)).toBe(min)
    expect(steppedZoom(max, 1)).toBe(max)
  })

  it('resets to 1 in either direction of zero', () => {
    expect(steppedZoom(3, 0)).toBe(ZOOM_DEFAULT)
    expect(steppedZoom(0.8, 0)).toBe(ZOOM_DEFAULT)
  })

  // A level that is not on the ladder — a persisted value from an older step
  // table — must not strand the control by matching nothing.
  it('snaps an off-ladder level to its nearest rung', () => {
    expect(steppedZoom(1.13, 1)).toBe(1.25)
    expect(steppedZoom(1.13, -1)).toBe(1)
  })
})

describe('canZoom', () => {
  it('is false only where the ladder ends', () => {
    expect(canZoom(1, 1)).toBe(true)
    expect(canZoom(ZOOM_STEPS.at(-1), 1)).toBe(false)
    expect(canZoom(ZOOM_STEPS[0], -1)).toBe(false)
    // Reset counts as a change only when something is actually zoomed.
    expect(canZoom(1, 0)).toBe(false)
    expect(canZoom(1.5, 0)).toBe(true)
  })
})

describe('zoomedPx', () => {
  it('returns whole pixels, because Monaco shimmers on a fractional size', () => {
    expect(zoomedPx(12, 1.25)).toBe(15)
    expect(zoomedPx(13, 1.1)).toBe(14)
    expect(Number.isInteger(zoomedPx(13, 1.75))).toBe(true)
  })
})

describe('zoomLabel', () => {
  it('reads as a percentage', () => {
    expect(zoomLabel(1)).toBe('100%')
    expect(zoomLabel(1.25)).toBe('125%')
  })
})
