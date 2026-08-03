import { describe, expect, it } from 'vitest'
import { naturalWidthOf } from '../../../src/renderer/src/utils/svgNaturalWidth'

// Mermaid strips width/height from its svg so CSS can own the size, which means
// the diagram always fills its container — a 35-node map shrinks until nothing
// is readable. The viewBox is the only record of how big it wanted to be.
describe('naturalWidthOf', () => {
  it('reads the width out of a viewBox', () => {
    expect(naturalWidthOf('0 0 1240 480')).toBe(1240)
    expect(naturalWidthOf('-8 -8 640.5 200')).toBe(641)
  })

  it('is null for anything it cannot read, so the caller leaves the svg alone', () => {
    expect(naturalWidthOf(null)).toBeNull()
    expect(naturalWidthOf('')).toBeNull()
    expect(naturalWidthOf('0 0')).toBeNull()
    expect(naturalWidthOf('0 0 nonsense 200')).toBeNull()
    expect(naturalWidthOf('0 0 0 200')).toBeNull()
  })

  // A hostile or broken diagram must not be able to demand a gigapixel canvas.
  it('caps an absurd width rather than trusting it', () => {
    expect(naturalWidthOf('0 0 999999 100')).toBe(20000)
  })
})
