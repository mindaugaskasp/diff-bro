import { describe, expect, it } from 'vitest'
import {
  chipsThatFit,
  nearestRows,
  orderedTags,
  rowsThatFit,
  shelfHeight
} from '../../../src/renderer/src/utils/tagShelf'

const STEP = 26 // a 22px chip plus the 4px gap
const GAP = 4

// The depth is a height because a chip is as wide as its name. Rows and pixels
// have to round-trip, or a drag lands mid-row and clips one.
describe('rows and the height they take', () => {
  it('round-trips: N rows measure back as N rows, both ways of asking', () => {
    for (let rows = 1; rows <= 12; rows += 1) {
      expect(rowsThatFit(shelfHeight(rows, STEP, GAP), STEP, GAP)).toBe(rows)
      expect(nearestRows(shelfHeight(rows, STEP, GAP), STEP, GAP)).toBe(rows)
    }
  })

  // The one that mattered in a real window: a 52px box was told it held three
  // 20.5px rows, and the third rendered clipped at the bottom edge.
  it('what FITS is floored — a part-row is not a row', () => {
    expect(rowsThatFit(52, 20.5, GAP)).toBe(2)
    expect(rowsThatFit(STEP * 3 - GAP - 1, STEP, GAP)).toBe(2)
    expect(rowsThatFit(0, STEP, GAP)).toBe(1)
    expect(rowsThatFit(-500, STEP, GAP)).toBe(1)
  })

  // The drag is the other question: which row is the hand nearest.
  it('what the drag SNAPS to is the nearer row', () => {
    expect(nearestRows(STEP * 2 - GAP + 5, STEP, GAP)).toBe(2)
    expect(nearestRows(STEP * 2 - GAP + 20, STEP, GAP)).toBe(3)
    expect(nearestRows(-500, STEP, GAP)).toBe(1)
  })

  it('survives a step it could not measure', () => {
    expect(rowsThatFit(100, 0, GAP)).toBe(1)
    expect(nearestRows(100, undefined, GAP)).toBe(1)
  })
})

// The packing IS the fix: four chips per row was a guess, and it made one row of
// pointer travel worth anything between half a rendered row and two.
describe('chipsThatFit', () => {
  const box = (rows) => ({ available: 200, gap: GAP, rows, trigger: 60 })

  it('shows every chip when they all fit, with no room kept for a trigger', () => {
    expect(chipsThatFit([90, 90], box(1))).toBe(2)
    expect(chipsThatFit([90, 90, 90, 90], box(2))).toBe(4)
  })

  it('keeps room for "+N more" as soon as anything is left over', () => {
    // Three 90s need two rows; in one row, two would fit — but the trigger has
    // to fit beside what is shown, so only one chip does.
    expect(chipsThatFit([90, 90, 90], box(1))).toBe(1)
  })

  it('counts the same chips into more rows as the shelf deepens', () => {
    const widths = Array.from({ length: 20 }, () => 90)
    const one = chipsThatFit(widths, box(1))
    const three = chipsThatFit(widths, box(3))
    expect(three).toBeGreaterThan(one)
    expect(chipsThatFit(widths, box(10))).toBe(20)
  })

  it('gives a chip wider than the shelf its own row rather than dropping it', () => {
    expect(chipsThatFit([500], box(1))).toBe(1)
    expect(chipsThatFit([500, 500], box(2))).toBe(2)
  })

  it('shows nothing rather than overflowing when not even one chip and the trigger fit', () => {
    expect(chipsThatFit([190, 190, 190], { available: 200, gap: GAP, rows: 1, trigger: 190 })).toBe(
      0
    )
  })

  it('takes an empty or missing list', () => {
    expect(chipsThatFit([], box(2))).toBe(0)
    expect(chipsThatFit(undefined, box(2))).toBe(0)
  })
})

// A filter you cannot see is worse than one you cannot reach: rank alone would
// hide your own choice behind "+42 more".
describe('orderedTags', () => {
  const all = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]

  it('puts the selected tags first, keeping the order within each group', () => {
    expect(orderedTags(all, ['c']).map((t) => t.name)).toEqual(['c', 'a', 'b'])
    expect(orderedTags(all, ['c', 'b']).map((t) => t.name)).toEqual(['b', 'c', 'a'])
  })

  it('leaves the ranking alone when nothing is selected', () => {
    expect(orderedTags(all, []).map((t) => t.name)).toEqual(['a', 'b', 'c'])
    expect(orderedTags(all, undefined)).toHaveLength(3)
    expect(orderedTags(undefined, [])).toEqual([])
  })
})
