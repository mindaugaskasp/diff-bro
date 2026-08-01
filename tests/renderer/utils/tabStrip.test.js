// The tab strip only scrolls once shrinking has hit its floor, and the chevrons
// only appear then. Sub-pixel rounding is the trap: scrollWidth and clientWidth
// disagree by fractions on a fresh layout, which showed the chevrons on a strip
// with nothing to scroll.
import { describe, expect, it } from 'vitest'
import { stripScroll } from '../../../src/renderer/src/utils/tabStrip'

const at = (scrollLeft, scrollWidth, clientWidth) =>
  stripScroll({ scrollLeft, scrollWidth, clientWidth })

describe('stripScroll', () => {
  it('is not overflowing when everything fits', () => {
    expect(at(0, 800, 800)).toEqual({ overflowing: false, atStart: true, atEnd: true })
  })

  it('ignores a sub-pixel difference rather than showing chevrons for it', () => {
    expect(at(0, 800.4, 800).overflowing).toBe(false)
  })

  it('reports both ends while scrolling through an overflowing strip', () => {
    expect(at(0, 1600, 800)).toMatchObject({ overflowing: true, atStart: true, atEnd: false })
    expect(at(400, 1600, 800)).toMatchObject({ atStart: false, atEnd: false })
    expect(at(800, 1600, 800)).toMatchObject({ atStart: false, atEnd: true })
  })

  it('counts a fractional scroll at the far end as the end', () => {
    expect(at(799.6, 1600, 800).atEnd).toBe(true)
  })

  it('survives a missing or unmeasured element', () => {
    expect(stripScroll(null)).toEqual({ overflowing: false, atStart: true, atEnd: true })
    expect(at(0, 0, 0).overflowing).toBe(false)
  })
})
