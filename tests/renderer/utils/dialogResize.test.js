import { describe, expect, it } from 'vitest'
import { resizeCentered, RESIZE_HANDLES } from '../../../src/renderer/src/utils/dialogResize'

const min = { width: 320, height: 240 }
const max = { width: 2000, height: 2000 }
const base = { startW: 600, startH: 400, min, max }

describe('resizeCentered', () => {
  // Centered growth: the cursor delta counts double so the dragged edge tracks
  // the pointer while both sides move out.
  it('grows width from the east edge by twice the cursor delta', () => {
    expect(resizeCentered({ ...base, handle: 'e', dx: 50, dy: 0 })).toEqual({ width: 700, height: 400 })
  })

  it('grows width from the west edge when dragged left', () => {
    expect(resizeCentered({ ...base, handle: 'w', dx: -50, dy: 0 })).toEqual({ width: 700, height: 400 })
  })

  it('grows height from the south edge, leaving width untouched', () => {
    expect(resizeCentered({ ...base, handle: 's', dx: 0, dy: 30 })).toEqual({ width: 600, height: 460 })
  })

  it('grows height from the north edge when dragged up', () => {
    expect(resizeCentered({ ...base, handle: 'n', dx: 0, dy: -30 })).toEqual({ width: 600, height: 460 })
  })

  it('changes both dimensions from a corner', () => {
    expect(resizeCentered({ ...base, handle: 'se', dx: 25, dy: 25 })).toEqual({ width: 650, height: 450 })
  })

  it('clamps to the minimum when dragged small', () => {
    expect(resizeCentered({ ...base, handle: 'e', dx: -1000, dy: 0 }).width).toBe(320)
  })

  it('clamps to the maximum when dragged large', () => {
    expect(resizeCentered({ ...base, handle: 'se', dx: 5000, dy: 5000 })).toEqual({
      width: 2000,
      height: 2000
    })
  })

  it('exposes all eight handles', () => {
    expect(RESIZE_HANDLES).toHaveLength(8)
    expect(RESIZE_HANDLES).toEqual(expect.arrayContaining(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']))
  })
})
