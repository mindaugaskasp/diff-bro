import { describe, expect, it } from 'vitest'
import { fittingCount } from '../../../src/renderer/src/utils/chipFold'

const base = { gap: 4, tail: 90, more: 36 }

describe('fittingCount', () => {
  it('shows every chip when they all fit beside the tail', () => {
    expect(fittingCount({ ...base, widths: [60, 60, 60], room: 400 })).toBe(3)
  })

  it('folds the rest and leaves room for the +N chip', () => {
    // 60+4+60+4 + 36+4 + 90 = 258 fits; a third chip would need 322.
    expect(fittingCount({ ...base, widths: [60, 60, 60, 60], room: 300 })).toBe(2)
  })

  it('can fold every chip', () => {
    expect(fittingCount({ ...base, widths: [200], room: 150 })).toBe(0)
  })
})
