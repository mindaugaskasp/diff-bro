import { describe, expect, it } from 'vitest'
import { barLayout, foldedIds } from '../../../src/renderer/src/utils/barFit'

// Widths stand in for measured control widths; the numbers are round so an
// off-by-one shows up as a wrong ID rather than a wrong pixel.
const widths = { clear: 30, capture: 30, copy: 30, paste: 90, save: 60, share: 60 }
const order = ['clear', 'capture', 'copy', 'paste']
const pinned = ['save', 'share']
const total = 300

describe('foldedIds', () => {
  it('folds nothing when everything already fits', () => {
    expect(foldedIds({ widths, available: total, order, pinned })).toEqual([])
    expect(foldedIds({ widths, available: total + 100, order, pinned })).toEqual([])
  })

  it('folds from the end of the order, least important first', () => {
    expect(foldedIds({ widths, available: 280, order, pinned })).toEqual(['clear'])
    expect(foldedIds({ widths, available: 240, order, pinned })).toEqual(['clear', 'capture'])
  })

  it('folds only as far as it has to', () => {
    // 300 → drop clear (270) → drop capture (240): the third is not needed.
    const folded = foldedIds({ widths, available: 240, order, pinned })
    expect(folded).not.toContain('copy')
  })

  it('never folds a pinned id, even when nothing else is left to give', () => {
    const folded = foldedIds({ widths, available: 10, order, pinned })
    expect(folded).toEqual(order)
    expect(folded).not.toContain('save')
    expect(folded).not.toContain('share')
  })

  it('counts the overflow trigger from the first fold', () => {
    // Without the trigger in the budget, 270 <= 280 stops after one fold and the
    // bar then overflows by exactly the trigger's width. This is that off-by-one.
    expect(foldedIds({ widths, available: 280, order, pinned, trigger: 36 })).toEqual([
      'clear',
      'capture'
    ])
  })

  it('does not charge for a trigger that is never drawn', () => {
    expect(foldedIds({ widths, available: total, order, pinned, trigger: 36 })).toEqual([])
  })

  it('ignores an id it has no measurement for', () => {
    const folded = foldedIds({ widths, available: 240, order: [...order, 'ghost'], pinned })
    expect(folded).not.toContain('ghost')
  })

  it('folds nothing before it has been measured', () => {
    expect(foldedIds({ widths, available: 0, order, pinned })).toEqual([])
    expect(foldedIds({ widths: {}, available: 500, order, pinned })).toEqual([])
  })
})

// The middle rung. A bar that folds the moment a label does not fit hides a
// control the reader could still have reached with a glyph.
describe('barLayout', () => {
  const compactWidth = 36
  const args = { labelled: widths, compactWidth, order, pinned, trigger: compactWidth }

  it('stays labelled while the words fit', () => {
    expect(barLayout({ ...args, available: total })).toEqual({ compact: false, folded: [] })
  })

  it('drops to icons rather than folding, when icons are enough', () => {
    // 6 controls × 36 = 216, so anything from there to 299 keeps all six.
    expect(barLayout({ ...args, available: 250 })).toEqual({ compact: true, folded: [] })
    expect(barLayout({ ...args, available: 216 })).toEqual({ compact: true, folded: [] })
  })

  it('folds only once the icons do not fit either', () => {
    // 216 into 150: three folds leave 108, plus the 36 trigger = 144.
    expect(barLayout({ ...args, available: 150 })).toEqual({
      compact: true,
      folded: ['clear', 'capture', 'copy']
    })
  })

  it('never reports a fold it has not compacted for', () => {
    const { compact, folded } = barLayout({ ...args, available: 40 })
    expect(compact).toBe(true)
    expect(folded).not.toContain('save')
    expect(folded).not.toContain('share')
  })

  // A budget of nothing is the moment there is LEAST room. Falling back to
  // `compact: false` drew every label at exactly the width that cannot hold them.
  it('degrades to the tersest layout when there is no room at all', () => {
    expect(barLayout({ ...args, available: 0 })).toEqual({
      compact: true,
      folded: ['clear', 'capture', 'copy', 'paste']
    })
    expect(barLayout({ ...args, available: -50 }).compact).toBe(true)
  })

  it('treats an unmeasured row as fitting rather than folding blind', () => {
    expect(barLayout({ ...args, labelled: {}, available: 0 })).toEqual({
      compact: false,
      folded: []
    })
  })
})
