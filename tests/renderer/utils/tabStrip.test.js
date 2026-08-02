// The chevrons appear only once shrinking has hit its floor and tabs are
// genuinely off-screen. Sub-pixel rounding is the trap: scrollWidth and
// clientWidth disagree by fractions on a fresh layout.
import { describe, expect, it } from 'vitest'
import { isOverflowing } from '../../../src/renderer/src/utils/tabStrip'

describe('isOverflowing', () => {
  it('is false when everything fits', () => {
    expect(isOverflowing({ scrollWidth: 800, clientWidth: 800 })).toBe(false)
  })

  it('ignores a sub-pixel difference rather than showing chevrons for it', () => {
    expect(isOverflowing({ scrollWidth: 800.4, clientWidth: 800 })).toBe(false)
  })

  it('is true once a tab is genuinely off-screen', () => {
    expect(isOverflowing({ scrollWidth: 1600, clientWidth: 800 })).toBe(true)
  })

  it('survives a missing or unmeasured element', () => {
    expect(isOverflowing(null)).toBe(false)
    expect(isOverflowing({ scrollWidth: 0, clientWidth: 0 })).toBe(false)
  })
})
