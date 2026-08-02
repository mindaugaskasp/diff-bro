import { describe, expect, it } from 'vitest'
import {
  alignRows,
  changedCells,
  cellsEqual,
  withinTolerance
} from '../../../src/renderer/src/utils/alignRows'

const statuses = (entries) => entries.map((e) => e.status)

describe('alignRows', () => {
  it('marks identical rows as same', () => {
    const rows = [
      ['a', 1],
      ['b', 2]
    ]
    expect(statuses(alignRows(rows, rows))).toEqual(['same', 'same'])
  })

  it('detects a changed cell in a row with a stable key column', () => {
    const left = [['id', 1, 2]]
    const right = [['id', 1, 9]]
    const [entry] = alignRows(left, right)
    expect(entry.status).toBe('changed')
    expect(entry.changed).toEqual([2])
    expect(entry.leftIndex).toBe(0)
    expect(entry.rightIndex).toBe(0)
  })

  it('does NOT cascade rows below an inserted row', () => {
    const left = [['A'], ['B'], ['C']]
    const right = [['A'], ['X'], ['B'], ['C']]
    const entries = alignRows(left, right)
    // The inserted X is added; B and C stay "same" rather than shifting into
    // a wall of false changes — the whole point of aligning instead of zipping.
    expect(statuses(entries)).toEqual(['same', 'added', 'same', 'same'])
    expect(entries[1].right).toEqual(['X'])
  })

  it('reports a deleted row as removed, not as changes down the sheet', () => {
    const left = [['A'], ['B'], ['C']]
    const right = [['A'], ['C']]
    expect(statuses(alignRows(left, right))).toEqual(['same', 'removed', 'same'])
  })

  it('separates a genuine add/remove from a same-key change', () => {
    // Mirrors the design mockup: North changes, West is removed, Central added.
    const left = [
      ['Region', 'Q1', 'Q2'],
      ['North', 100, 120],
      ['South', 90, 95],
      ['East', 70, 80],
      ['West', 50, 60],
      ['Total', 310, 355]
    ]
    const right = [
      ['Region', 'Q1', 'Q2'],
      ['North', 100, 150],
      ['South', 90, 95],
      ['East', 70, 80],
      ['Central', 40, 55],
      ['Total', 310, 355]
    ]
    const entries = alignRows(left, right)
    expect(statuses(entries)).toEqual([
      'same',
      'changed',
      'same',
      'same',
      'removed',
      'added',
      'same'
    ])
    expect(entries[1].changed).toEqual([2]) // North's Q2 cell only
    expect(entries[4].left).toEqual(['West', 50, 60])
    expect(entries[5].right).toEqual(['Central', 40, 55])
  })

  it('treats trailing empty cells and null as absent', () => {
    expect(cellsEqual(null, '')).toBe(true)
    expect(changedCells(['a', 1], ['a', 1, null, ''])).toEqual([])
    const [entry] = alignRows([['a', 1]], [['a', 1, null, '']])
    expect(entry.status).toBe('same')
  })

  it('falls back to positional alignment past the LCS size budget', () => {
    const left = [
      ['a', 1],
      ['b', 2]
    ]
    const right = [
      ['a', 1],
      ['b', 9]
    ]
    // Force the fallback path; it still produces a same + a changed row.
    const entries = alignRows(left, right, { maxProduct: 0 })
    expect(statuses(entries)).toEqual(['same', 'changed'])
    expect(entries[1].changed).toEqual([1])
  })
})

describe('withinTolerance', () => {
  it('forgives a difference at or under the absolute floor', () => {
    expect(withinTolerance(500, 500.01, { abs: 0.01 })).toBe(true)
    expect(withinTolerance(500, 500.02, { abs: 0.01 })).toBe(false)
  })

  it('forgives a difference at or under the relative threshold', () => {
    expect(withinTolerance(1000, 1005, { pct: 1 })).toBe(true)
    expect(withinTolerance(1000, 1050, { pct: 1 })).toBe(false)
  })

  // A figure that crossed zero is never "the same number, rounded differently",
  // however generous the threshold.
  it('never forgives a sign change', () => {
    expect(withinTolerance(5, -5, { pct: 1000 })).toBe(false)
    expect(withinTolerance(-1, 1, { abs: 100 })).toBe(false)
  })

  it('leaves anything that is not two finite numbers alone', () => {
    expect(withinTolerance('500', 500, { abs: 1 })).toBe(false)
    expect(withinTolerance(Number.NaN, Number.NaN, { abs: 1 })).toBe(false)
    expect(withinTolerance(1, 1.0001, null)).toBe(false)
  })
})

describe('cellsEqual — tagged cells', () => {
  const cell = (v, k) => ({ v, k })

  it('compares the value and what stands behind it separately', () => {
    expect(cellsEqual(cell(3, '=RC[-1]'), cell(3, '=RC[-1]'))).toBe(true)
    // Same number, but one side is no longer a formula.
    expect(cellsEqual(cell(3, '=RC[-1]'), 3)).toBe(false)
    expect(cellsEqual(cell(3, '=RC[-1]'), cell(3, '=RC[-2]'))).toBe(false)
  })

  it('applies the tolerance to the result a formula produced', () => {
    expect(cellsEqual(cell(500.004, '=SUM'), cell(500, '=SUM'), { abs: 0.01 })).toBe(true)
    // The tolerance forgives the result, never the formula going away.
    expect(cellsEqual(cell(500.004, '=SUM'), 500, { abs: 0.01 })).toBe(false)
  })

  // Materiality is about amounts. 0.5% of the serial 45870 is 229 days.
  it('never lets a tolerance reach an exact-only cell', () => {
    const date = (v) => ({ v, k: '', x: true })
    expect(cellsEqual(date(45870), date(46100), { pct: 1 })).toBe(false)
    expect(cellsEqual(date(45870), date(45870.004), { abs: 0.01 })).toBe(false)
    expect(cellsEqual(date(45870), date(45870), { pct: 1 })).toBe(true)
    // One side date-formatted and the other not is still one comparison.
    expect(cellsEqual(date(45870), 46100, { pct: 1 })).toBe(false)
  })
})
