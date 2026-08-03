// Mermaid removes width/height from its svg so CSS owns the size, which makes
// every diagram fit its container — fine for a preview, useless for a 35-node
// map where fit-to-width is the one size it cannot be read at. The viewBox is
// the only record of how wide the layout actually wanted to be.

// A diagram cannot ask for an unbounded canvas: a broken or hostile viewBox
// would otherwise size an element in the hundreds of thousands of pixels.
const MAX_WIDTH = 20000

/**
 * The width a viewBox asks for, or null when it says nothing usable.
 * @param {string|null} viewBox
 * @returns {number|null}
 */
export function naturalWidthOf(viewBox) {
  const parts = String(viewBox ?? '')
    .trim()
    .split(/[\s,]+/)
  if (parts.length !== 4) return null
  const width = Number(parts[2])
  if (!Number.isFinite(width) || width <= 0) return null
  return Math.min(MAX_WIDTH, Math.round(width))
}
