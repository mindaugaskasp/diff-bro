import { describe, expect, it } from 'vitest'
import { compositeKeys, matchRowsByKey } from '../../../src/renderer/src/utils/matchRowsByKey'
import { alignRows } from '../../../src/renderer/src/utils/alignRows'

const statuses = (result) => result.rows.map((e) => e.status)
const keysOf = (result) => result.rows.map((e) => (e.left ?? e.right)[0])

const byColumn = (left, right, columns = [0], opts = {}) =>
  matchRowsByKey(left, right, {
    leftKeys: compositeKeys(left, columns),
    rightKeys: compositeKeys(right, columns),
    ...opts
  })

describe('matchRowsByKey', () => {
  // The reopened-track defect: the same export sorted differently reads as
  // changed end to end, because the LCS matches whole-row signatures in order.
  const ledger = [
    ['1001', 500],
    ['1002', 300],
    ['1003', 120]
  ]
  const resorted = [
    ['1003', 120],
    ['1002', 300],
    ['1001', 500]
  ]

  it('pairs re-sorted rows that the row-signature LCS cannot', () => {
    expect(statuses({ rows: alignRows(ledger, resorted) })).not.toEqual(['same', 'same', 'same'])
    expect(statuses(byColumn(ledger, resorted))).toEqual(['same', 'same', 'same'])
  })

  it('reports the cell that moved, not the row that moved', () => {
    const right = [
      ['1003', 120],
      ['1002', 999],
      ['1001', 500]
    ]
    const { rows } = byColumn(ledger, right)
    expect(statuses({ rows })).toEqual(['same', 'changed', 'same'])
    expect(rows[1].changed).toEqual([1])
    expect(rows[1].leftIndex).toBe(1)
    expect(rows[1].rightIndex).toBe(1)
  })

  it('keys on more than one column', () => {
    const left = [
      ['1001', 'EMEA', 500],
      ['1001', 'APAC', 300]
    ]
    const right = [
      ['1001', 'APAC', 300],
      ['1001', 'EMEA', 500]
    ]
    expect(statuses(byColumn(left, right, [0]))).not.toEqual(['same', 'same'])
    expect(statuses(byColumn(left, right, [0, 1]))).toEqual(['same', 'same'])
  })

  it('marks a row only one side has', () => {
    const right = [
      ['1003', 120],
      ['1004', 80]
    ]
    const result = byColumn(ledger, right)
    expect(statuses(result)).toEqual(['removed', 'removed', 'same', 'added'])
    expect(keysOf(result)).toEqual(['1001', '1002', '1003', '1004'])
  })

  // A removed row belongs beside the rows it sat next to, not in a heap at the
  // end: it is emitted just before the first surviving left row that followed it.
  it('follows the right file’s order and keeps a removed row in place', () => {
    const left = [
      ['A', 1],
      ['B', 2],
      ['C', 3],
      ['D', 4]
    ]
    const right = [
      ['D', 4],
      ['B', 2],
      ['A', 1]
    ]
    const result = byColumn(left, right)
    expect(keysOf(result)).toEqual(['C', 'D', 'B', 'A'])
    expect(statuses(result)).toEqual(['removed', 'same', 'same', 'same'])
  })

  it('pairs duplicate keys in order of occurrence and counts them', () => {
    const left = [
      ['X', 1],
      ['X', 2],
      ['Y', 3]
    ]
    const right = [
      ['X', 1],
      ['Y', 3]
    ]
    const result = byColumn(left, right)
    expect(result.duplicateKeys).toBe(1)
    expect(statuses(result)).toEqual(['same', 'removed', 'same'])
    expect(result.rows[1].leftIndex).toBe(1)
  })

  it('counts a key duplicated on the right too', () => {
    const left = [['X', 1]]
    const right = [
      ['X', 1],
      ['X', 2]
    ]
    const result = byColumn(left, right)
    expect(result.duplicateKeys).toBe(1)
    expect(statuses(result)).toEqual(['same', 'added'])
  })

  // A blank key is a key. Letting it match anything would pair a spacer row with
  // whatever happened to be unmatched.
  it('treats a blank key as a key, not a wildcard', () => {
    const left = [
      ['', 1],
      ['', 2],
      ['A', 3]
    ]
    const right = [
      ['', 1],
      ['A', 3]
    ]
    const result = byColumn(left, right)
    expect(statuses(result)).toEqual(['same', 'removed', 'same'])
  })

  it('applies the tolerance to a matched pair', () => {
    const left = [['1001', 500]]
    const right = [['1001', 500.004]]
    expect(statuses(byColumn(left, right))).toEqual(['changed'])
    expect(statuses(byColumn(left, right, [0], { tolerance: { abs: 0.01 } }))).toEqual(['same'])
  })

  it('handles an empty side', () => {
    expect(statuses(byColumn([], ledger))).toEqual(['added', 'added', 'added'])
    expect(statuses(byColumn(ledger, []))).toEqual(['removed', 'removed', 'removed'])
  })
})

describe('compositeKeys', () => {
  it('trims, so a trailing space in an export is not a different account', () => {
    expect(compositeKeys([['1001 ']], [0])).toEqual(compositeKeys([['1001']], [0]))
  })

  it('does not fold case — two accounts are two accounts', () => {
    expect(compositeKeys([['ACC-1']], [0])).not.toEqual(compositeKeys([['acc-1']], [0]))
  })

  // Joining on a separator a cell can contain would let ['a','b'] and ['a b']
  // collide into one key.
  it('cannot collide two different key tuples into one', () => {
    const [ab] = compositeKeys([['a', 'b']], [0, 1])
    const [joined] = compositeKeys([['a b', '']], [0, 1])
    expect(ab).not.toBe(joined)
  })

  it('reads a missing cell as blank', () => {
    expect(compositeKeys([[null], [undefined], []], [0])).toEqual(['', '', ''])
  })
})
