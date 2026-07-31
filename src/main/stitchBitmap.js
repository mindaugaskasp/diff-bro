// Joining the scroll-and-stitch slices into the one tall bitmap the exported
// PNG is made from. Raw BGRA rows, so stitching is a concatenation — no image
// library, no re-encode per slice. Pure, so the refusals are unit-tested
// without Electron.

// Slices arrive from a renderer-driven loop, so the total is not something the
// main process should take on trust: a bitmap is width × height × 4 bytes held
// in memory at once, and an unbounded one is an allocation the app never
// recovers from.
//
// These are a MEMORY backstop, not the user-facing limit — that one lives in
// settings, in screen pixels, so it covers the same amount of diff on every
// display. These sit far enough above it to accommodate that setting at its
// maximum on a 3× screen, and only ever fire on a runaway loop. The pixel count
// is what actually bounds the allocation; height alone would let a very wide
// window slip past it.
export const MAX_STITCH_HEIGHT = 40000
export const MAX_STITCH_PIXELS = 80_000_000

const BYTES_PER_PIXEL = 4

/**
 * @typedef {object} BitmapSlice
 * @property {Buffer} data    BGRA rows, top to bottom
 * @property {number} width   device pixels
 * @property {number} height  device pixels
 */

// Total rows across slices that all share `width`, or null if any disagrees.
function stackedHeight(slices, width) {
  let height = 0
  for (const s of slices) {
    if (s.width !== width || !(s.height > 0)) return null
    height += s.height
  }
  return height
}

const fitsInMemory = (width, height) =>
  height <= MAX_STITCH_HEIGHT && width * height <= MAX_STITCH_PIXELS

const rowsMatchBuffers = (slices, width) =>
  slices.every((s) => s.data?.length === width * s.height * BYTES_PER_PIXEL)

/**
 * @param {BitmapSlice[]} slices  in top-to-bottom order
 * @returns {BitmapSlice | null}  null when the slices cannot form one image
 */
export function stitchBitmaps(slices) {
  if (!Array.isArray(slices) || !slices.length) return null
  const { width } = slices[0]
  if (!(width > 0)) return null
  const height = stackedHeight(slices, width)
  // The ceilings are checked from the declared sizes alone, before a buffer is
  // touched — the point is not to allocate it, not to notice afterwards.
  if (height === null || !fitsInMemory(width, height)) return null
  if (!rowsMatchBuffers(slices, width)) return null
  return { data: Buffer.concat(slices.map((s) => s.data)), width, height }
}
