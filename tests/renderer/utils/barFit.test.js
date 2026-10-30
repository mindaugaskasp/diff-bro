import { describe, expect, it } from 'vitest'
import { foldedIds, iconBarWidths } from '../../../src/renderer/src/utils/barFit'

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

// Two rungs since #144: every action is an icon from the start and only the
// labelled primary costs its measured width; past that, actions fold.
describe('iconBarWidths', () => {
  const unit = 36

  it('charges every action one icon unit', () => {
    expect(iconBarWidths({ ids: ['copy', 'share'], unit, labelled: {} })).toEqual({
      copy: 36,
      share: 36
    })
  })

  it('charges a labelled primary its measured width', () => {
    expect(iconBarWidths({ ids: ['copy', 'save'], unit, labelled: { save: 80 } })).toEqual({
      copy: 36,
      save: 80
    })
  })

  it('folds icons, never the labelled primary, once they stop fitting', () => {
    const w = iconBarWidths({ ids: ['clear', 'copy', 'save'], unit, labelled: { save: 80 } })
    // 152 into 130: one fold leaves 116, plus the 36 trigger = 152 — so two.
    expect(
      foldedIds({
        widths: w,
        available: 130,
        order: ['clear', 'copy'],
        pinned: ['save'],
        trigger: unit
      })
    ).toEqual(['clear', 'copy'])
  })
})
