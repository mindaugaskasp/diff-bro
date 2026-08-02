import { describe, expect, it } from 'vitest'
import { fittingCount } from '../../../src/renderer/src/utils/railFit'

// The collapsed rail draws as many recent tools as its leftover column holds:
// too many and the last is clipped mid-icon, too few and the space is wasted.
describe('fittingCount', () => {
  it('counts whole items only', () => {
    expect(fittingCount({ height: 180, item: 36, max: 9 })).toBe(5)
    expect(fittingCount({ height: 179, item: 36, max: 9 })).toBe(4)
    expect(fittingCount({ height: 36, item: 36, max: 9 })).toBe(1)
  })

  it('never exceeds what is remembered', () => {
    expect(fittingCount({ height: 4000, item: 36, max: 9 })).toBe(9)
  })

  it('reports none rather than a negative or a fraction', () => {
    expect(fittingCount({ height: 20, item: 36, max: 9 })).toBe(0)
    expect(fittingCount({ height: 0, item: 36, max: 9 })).toBe(0)
    expect(fittingCount({ height: -50, item: 36, max: 9 })).toBe(0)
  })

  // A box that has not been laid out yet, or a token that failed to parse.
  it('survives missing measurements', () => {
    expect(fittingCount({ height: NaN, item: 36, max: 9 })).toBe(0)
    expect(fittingCount({ height: 180, item: 0, max: 9 })).toBe(0)
    expect(fittingCount({ height: 180, item: NaN, max: 9 })).toBe(0)
  })
})
