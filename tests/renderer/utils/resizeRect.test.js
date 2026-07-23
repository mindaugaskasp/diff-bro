import { describe, expect, it } from 'vitest'
import { resizeRect, centeredRect } from '../../../src/renderer/src/utils/resizeRect'

const MIN = { width: 100, height: 80 }
const BOUNDS = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 }
const start = { left: 400, top: 300, width: 200, height: 150 }
const resize = (corner, dx, dy, bounds = BOUNDS) =>
  resizeRect({ rect: start, corner, dx, dy, min: MIN, bounds })

describe('resizeRect', () => {
  it('grows from the SE corner, pinning the NW corner', () => {
    expect(resize('se', 50, 40)).toEqual({ left: 400, top: 300, width: 250, height: 190 })
  })

  it('grows from the NW corner, pinning the SE corner', () => {
    // SE corner (600, 450) stays put; the box grows up and to the left.
    expect(resize('nw', -50, -40)).toEqual({ left: 350, top: 260, width: 250, height: 190 })
  })

  it('handles the mixed NE / SW corners independently per axis', () => {
    expect(resize('ne', 30, -20)).toEqual({ left: 400, top: 280, width: 230, height: 170 })
    expect(resize('sw', -30, 20)).toEqual({ left: 370, top: 300, width: 230, height: 170 })
  })

  it('never shrinks below the minimum size', () => {
    const r = resize('se', -1000, -1000)
    expect(r.width).toBe(MIN.width)
    expect(r.height).toBe(MIN.height)
  })

  it('clamps a dragged edge to the viewport bounds', () => {
    const tight = { minX: 0, minY: 0, maxX: 620, maxY: 1000 }
    const r = resize('se', 9999, 0, tight)
    expect(r.left + r.width).toBe(620) // east edge stops at the bound
  })

  it('centres a rect in the viewport', () => {
    expect(centeredRect(200, 100, 1000, 600)).toEqual({
      left: 400,
      top: 250,
      width: 200,
      height: 100
    })
  })
})
