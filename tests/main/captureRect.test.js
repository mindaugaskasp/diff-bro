import { describe, expect, it } from 'vitest'
import {
  MAX_CAPTURE_SIDE,
  MAX_PREVIEW_HEIGHT,
  MIN_CAPTURE_SIDE,
  normalizeCaptureRect,
  pngDimensions,
  previewSize,
  safeImageName
} from '../../src/main/captureRect'

const BOUNDS = { width: 1200, height: 800 }

describe('normalizeCaptureRect', () => {
  it('passes a rect that already sits inside the window', () => {
    const rect = { x: 260, y: 90, width: 900, height: 640 }
    expect(normalizeCaptureRect(rect, BOUNDS)).toEqual(rect)
  })

  it('rounds sub-pixel geometry to whole device rows', () => {
    expect(normalizeCaptureRect({ x: 10.4, y: 20.6, width: 100.5, height: 200.2 }, BOUNDS)).toEqual(
      {
        x: 10,
        y: 21,
        width: 101,
        height: 200
      }
    )
  })

  it('clamps a rect that runs past the window edge', () => {
    const out = normalizeCaptureRect({ x: 1000, y: 700, width: 5000, height: 5000 }, BOUNDS)
    expect(out).toEqual({ x: 1000, y: 700, width: 200, height: 100 })
  })

  it('pulls a negative origin back to the window corner', () => {
    const out = normalizeCaptureRect({ x: -50, y: -80, width: 400, height: 300 }, BOUNDS)
    expect(out).toEqual({ x: 0, y: 0, width: 400, height: 300 })
  })

  it('refuses a rect the renderer made up', () => {
    for (const bad of [null, undefined, 'x', 42, [], {}]) {
      expect(normalizeCaptureRect(bad, BOUNDS)).toBeNull()
    }
  })

  it('refuses non-finite numbers rather than handing NaN to capturePage', () => {
    expect(normalizeCaptureRect({ x: NaN, y: 0, width: 100, height: 100 }, BOUNDS)).toBeNull()
    expect(normalizeCaptureRect({ x: 0, y: 0, width: Infinity, height: 100 }, BOUNDS)).toBeNull()
    expect(normalizeCaptureRect({ x: 0, y: 0, width: 100, height: '100' }, BOUNDS)).toBeNull()
  })

  it('refuses when the window bounds are unusable', () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 }
    expect(normalizeCaptureRect(rect, null)).toBeNull()
    expect(normalizeCaptureRect(rect, { width: NaN, height: 800 })).toBeNull()
  })

  it('refuses a region too small to be a diff', () => {
    const tiny = MIN_CAPTURE_SIDE - 1
    expect(normalizeCaptureRect({ x: 0, y: 0, width: tiny, height: 400 }, BOUNDS)).toBeNull()
    expect(normalizeCaptureRect({ x: 0, y: 0, width: 400, height: tiny }, BOUNDS)).toBeNull()
  })

  it('refuses a rect whose origin is already outside the window', () => {
    // Clamping the origin to the edge leaves no width left to capture.
    expect(normalizeCaptureRect({ x: 1199, y: 0, width: 900, height: 400 }, BOUNDS)).toBeNull()
  })

  it('caps an absurd capture on a huge window', () => {
    const huge = { width: 40000, height: 40000 }
    const out = normalizeCaptureRect({ x: 0, y: 0, width: 30000, height: 30000 }, huge)
    expect(out).toEqual({ x: 0, y: 0, width: MAX_CAPTURE_SIDE, height: MAX_CAPTURE_SIDE })
  })
})

describe('safeImageName', () => {
  it('keeps an ordinary name', () => {
    expect(safeImageName('Nightly config')).toBe('Nightly config')
  })

  it('strips path separators and traversal so the name cannot escape the folder', () => {
    // The invariant, not the exact spelling: no separator survives, and the
    // name never starts with a dot (a leading '.' would hide the file, and a
    // leading '..' is what makes a separator dangerous in the first place).
    for (const hostile of ['../../etc/passwd', '..\\..\\windows\\system32', '/etc/shadow', '.']) {
      const out = safeImageName(hostile)
      expect(out).not.toMatch(/[\\/]/)
      expect(out.startsWith('.')).toBe(false)
    }
    expect(safeImageName('.hidden')).toBe('hidden')
    expect(safeImageName('a/b')).toBe('a-b')
  })

  it('strips characters Windows refuses in a filename', () => {
    expect(safeImageName('a:b*c?d"e<f>g|h')).toBe('a-b-c-d-e-f-g-h')
  })

  it('falls back rather than producing an empty filename', () => {
    for (const bad of ['', '   ', null, undefined, '...', {}]) {
      expect(safeImageName(bad)).toBeTruthy()
    }
    expect(safeImageName('')).toBe('diff')
  })

  it('caps the length', () => {
    expect(safeImageName('x'.repeat(500))).toHaveLength(80)
  })
})

describe('pngDimensions', () => {
  // A minimal PNG header: signature, IHDR length, 'IHDR', width, height.
  function header(width, height, { tag = 'IHDR' } = {}) {
    const buf = Buffer.alloc(33)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0)
    buf.writeUInt32BE(13, 8)
    buf.write(tag, 12, 'ascii')
    buf.writeUInt32BE(width, 16)
    buf.writeUInt32BE(height, 20)
    return buf
  }

  it('reads the real pixel size out of the IHDR chunk', () => {
    expect(pngDimensions(header(2288, 1274))).toEqual({ width: 2288, height: 1274 })
  })

  it('handles a HiDPI capture without overflowing', () => {
    expect(pngDimensions(header(8192, 8192))).toEqual({ width: 8192, height: 8192 })
  })

  it('returns null for bytes that are not a PNG header', () => {
    expect(pngDimensions(header(10, 10, { tag: 'JUNK' }))).toBeNull()
  })

  it('returns null rather than reading past a truncated buffer', () => {
    expect(pngDimensions(header(100, 100).subarray(0, 20))).toBeNull()
    expect(pngDimensions(Buffer.alloc(0))).toBeNull()
    expect(pngDimensions(null)).toBeNull()
  })
})

describe('previewSize', () => {
  it('leaves a capture that already fits alone', () => {
    expect(previewSize({ width: 1800, height: 900 })).toBeNull()
    expect(previewSize({ width: 1800, height: MAX_PREVIEW_HEIGHT })).toBeNull()
  })

  it('shrinks a tall capture to the ceiling, keeping its proportions', () => {
    const size = previewSize({ width: 1800, height: 16384 }, 4096)
    expect(size).toEqual({ width: 450, height: 4096 })
    // Same aspect ratio as the original — a stretched preview would misrepresent
    // the picture the user is about to save.
    expect(size.width / size.height).toBeCloseTo(1800 / 16384, 5)
  })

  it('never rounds a sliver away to zero width', () => {
    expect(previewSize({ width: 2, height: 100_000 }, 4096).width).toBe(1)
  })

  it('refuses a degenerate size rather than dividing by zero', () => {
    expect(previewSize({ width: 0, height: 9000 })).toBeNull()
    expect(previewSize({ width: 100, height: 0 })).toBeNull()
  })
})
