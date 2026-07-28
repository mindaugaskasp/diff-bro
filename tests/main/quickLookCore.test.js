import { describe, expect, it } from 'vitest'
import { placeWindow, displayForPoint, resolveAccelerator } from '../../src/main/quickLookCore'

describe('placeWindow', () => {
  const work = { x: 0, y: 0, width: 1920, height: 1080 }
  const win = { width: 720, height: 480 }

  it('centres horizontally and sits in the upper third', () => {
    const { x, y } = placeWindow(work, win)
    expect(x).toBe((1920 - 720) / 2) // 600
    // upper third: 28% of the free vertical space above the window
    expect(y).toBe(Math.round((1080 - 480) * 0.28)) // 168
  })

  it('offsets by the display origin on a secondary monitor', () => {
    const { x, y } = placeWindow({ x: 1920, y: 0, width: 1280, height: 800 }, win)
    expect(x).toBe(1920 + Math.round((1280 - 720) / 2))
    expect(y).toBe(Math.round((800 - 480) * 0.28))
  })

  it('clamps a window larger than the work area to the top-left origin', () => {
    const { x, y } = placeWindow({ x: 10, y: 20, width: 400, height: 300 }, win)
    expect(x).toBe(10)
    expect(y).toBe(20)
  })
})

describe('displayForPoint', () => {
  const displays = [
    { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
    { bounds: { x: 1920, y: 0, width: 1280, height: 800 } }
  ]

  it('returns the display whose bounds contain the point', () => {
    expect(displayForPoint(displays, { x: 2000, y: 100 })).toBe(displays[1])
    expect(displayForPoint(displays, { x: 10, y: 10 })).toBe(displays[0])
  })

  it('falls back to the first display when the point is off every screen', () => {
    expect(displayForPoint(displays, { x: -50, y: -50 })).toBe(displays[0])
  })

  it('returns null when there are no displays', () => {
    expect(displayForPoint([], { x: 0, y: 0 })).toBe(null)
    expect(displayForPoint(null, { x: 0, y: 0 })).toBe(null)
  })
})

describe('resolveAccelerator', () => {
  const FALLBACK = 'CommandOrControl+Shift+Space'
  it('keeps a non-empty stored accelerator', () => {
    expect(resolveAccelerator('Alt+Shift+D', FALLBACK)).toBe('Alt+Shift+D')
  })
  it('falls back for missing, empty, or non-string values', () => {
    expect(resolveAccelerator(undefined, FALLBACK)).toBe(FALLBACK)
    expect(resolveAccelerator('', FALLBACK)).toBe(FALLBACK)
    expect(resolveAccelerator('   ', FALLBACK)).toBe(FALLBACK)
    expect(resolveAccelerator(42, FALLBACK)).toBe(FALLBACK)
  })
})
