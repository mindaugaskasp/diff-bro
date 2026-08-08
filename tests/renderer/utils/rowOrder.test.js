// The sidebar's manual order. Pure, because everything interesting is index
// arithmetic: a drop that moves an item DOWN lands one place short unless the
// removal is accounted for, which is the bug every hand-rolled version has.
import { describe, expect, it } from 'vitest'
import {
  assignOrder,
  moveWithin,
  reindex,
  NEW_ENTRY_ORDER
} from '../../../src/renderer/src/utils/rowOrder'

const rows = (...names) => names.map((name, i) => ({ id: name, order: i }))
const ids = (list) => list.map((e) => e.id)

describe('assignOrder', () => {
  it('numbers a group that has never been ordered, in the order shown', () => {
    const out = assignOrder([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    expect(out.map((e) => e.order)).toEqual([0, 1, 2])
    expect(ids(out)).toEqual(['a', 'b', 'c'])
  })

  // The migration has to be invisible: whatever the list looked like before is
  // what it looks like after.
  it('leaves an order that is already there alone', () => {
    const out = assignOrder([
      { id: 'a', order: 5 },
      { id: 'b', order: 2 }
    ])
    expect(out.map((e) => e.order)).toEqual([5, 2])
  })

  it('fills only the gaps, without renumbering the rest', () => {
    const out = assignOrder([{ id: 'a', order: 7 }, { id: 'b' }, { id: 'c', order: 9 }])
    expect(out.map((e) => e.order)).toEqual([7, 1, 9])
  })

  it('does not mutate what it was given', () => {
    const input = [{ id: 'a' }]
    assignOrder(input)
    expect(input[0].order).toBeUndefined()
  })
})

describe('moveWithin', () => {
  it('moves an item up', () => {
    expect(ids(moveWithin(rows('a', 'b', 'c'), 2, 0))).toEqual(['c', 'a', 'b'])
  })

  // Down is where the off-by-one lives: `to` indexes the list BEFORE the move,
  // so dropping onto index 2 means "in front of c" and must not overshoot it.
  it('moves an item down to the row it was dropped in front of', () => {
    expect(ids(moveWithin(rows('a', 'b', 'c'), 0, 2))).toEqual(['b', 'a', 'c'])
  })

  it('moves an item to the very end', () => {
    expect(ids(moveWithin(rows('a', 'b', 'c'), 0, 3))).toEqual(['b', 'c', 'a'])
  })

  it('is a no-op onto itself', () => {
    expect(ids(moveWithin(rows('a', 'b', 'c'), 1, 1))).toEqual(['a', 'b', 'c'])
    expect(ids(moveWithin(rows('a', 'b', 'c'), 1, 2))).toEqual(['a', 'b', 'c'])
  })

  it('never changes length or membership', () => {
    const out = moveWithin(rows('a', 'b', 'c', 'd'), 3, 1)
    expect(out).toHaveLength(4)
    expect(ids(out).sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('ignores an index that is not in the list', () => {
    expect(ids(moveWithin(rows('a', 'b'), 5, 0))).toEqual(['a', 'b'])
    expect(ids(moveWithin(rows('a', 'b'), -1, 0))).toEqual(['a', 'b'])
  })

  it('renumbers as it moves, so the result is 0…n-1 with no gaps', () => {
    expect(moveWithin(rows('a', 'b', 'c'), 2, 0).map((e) => e.order)).toEqual([0, 1, 2])
  })
})

describe('reindex', () => {
  it('produces 0…n-1 in the order given', () => {
    expect(reindex(rows('a', 'b', 'c')).map((e) => e.order)).toEqual([0, 1, 2])
  })

  it('closes gaps left by a deletion', () => {
    const out = reindex([
      { id: 'a', order: 0 },
      { id: 'c', order: 4 }
    ])
    expect(out.map((e) => e.order)).toEqual([0, 1])
  })
})

// A new entry has not been placed by anyone, so it leads its group — which is
// the newest-first feel the lists had before there was an order at all.
describe('a new entry', () => {
  it('sorts above everything already placed', () => {
    expect(NEW_ENTRY_ORDER).toBeLessThan(0)
  })

  it('is renumbered into the group by the next reindex', () => {
    const out = reindex(
      [
        { id: 'old', order: 0 },
        { id: 'new', order: NEW_ENTRY_ORDER }
      ].sort((a, b) => a.order - b.order)
    )
    expect(ids(out)).toEqual(['new', 'old'])
    expect(out.map((e) => e.order)).toEqual([0, 1])
  })
})
