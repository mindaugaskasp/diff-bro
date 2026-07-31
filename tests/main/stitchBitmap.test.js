import { describe, expect, it } from 'vitest'
import { MAX_STITCH_HEIGHT, MAX_STITCH_PIXELS, stitchBitmaps } from '../../src/main/stitchBitmap'

// One slice of solid colour, so a stitched result can be read back row by row.
const slice = (width, height, fill) => ({
  data: Buffer.alloc(width * height * 4, fill),
  width,
  height
})

const rowAt = (merged, y) => merged.data[y * merged.width * 4]

describe('stitchBitmaps', () => {
  it('joins slices top to bottom into one tall bitmap', () => {
    const merged = stitchBitmaps([slice(4, 2, 0x11), slice(4, 3, 0x22)])
    expect(merged).toMatchObject({ width: 4, height: 5 })
    expect(merged.data).toHaveLength(4 * 5 * 4)
    expect(rowAt(merged, 0)).toBe(0x11)
    expect(rowAt(merged, 1)).toBe(0x11)
    expect(rowAt(merged, 2)).toBe(0x22)
    expect(rowAt(merged, 4)).toBe(0x22)
  })

  it('passes a single slice through unchanged', () => {
    const merged = stitchBitmaps([slice(4, 3, 0x33)])
    expect(merged).toMatchObject({ width: 4, height: 3 })
  })

  // Concatenating rows of different widths would shear the image into diagonal
  // garbage rather than fail, so this has to be refused outright.
  it('refuses slices whose widths disagree', () => {
    expect(stitchBitmaps([slice(4, 2, 0), slice(5, 2, 0)])).toBeNull()
  })

  it('refuses a slice whose buffer is not exactly width × height × 4', () => {
    const bad = { data: Buffer.alloc(10), width: 4, height: 2 }
    expect(stitchBitmaps([bad])).toBeNull()
  })

  it('refuses an empty or absent list', () => {
    expect(stitchBitmaps([])).toBeNull()
    expect(stitchBitmaps(null)).toBeNull()
  })

  it('refuses a result taller than the ceiling rather than allocating it', () => {
    const half = slice(4, MAX_STITCH_HEIGHT / 2, 0)
    expect(stitchBitmaps([half, half])).toMatchObject({ height: MAX_STITCH_HEIGHT })
    expect(stitchBitmaps([half, half, slice(4, 1, 0)])).toBeNull()
  })

  // Height alone doesn't bound the allocation: a very wide window multiplies it
  // by the same amount, and it is bytes, not rows, that exhaust memory.
  it('refuses a result with too many pixels even when it is short enough', () => {
    const wide = { data: Buffer.alloc(0), width: 20_000, height: 8_000 }
    expect(wide.height).toBeLessThan(MAX_STITCH_HEIGHT)
    expect(wide.width * wide.height).toBeGreaterThan(MAX_STITCH_PIXELS)
    expect(stitchBitmaps([wide])).toBeNull()
  })
})
