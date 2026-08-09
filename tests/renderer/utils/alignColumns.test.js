import { describe, expect, it } from 'vitest'
import {
  alignColumns,
  headerPairing,
  pairedColumns
} from '../../../src/renderer/src/utils/alignColumns'

const pairs = (cols) => cols.map((c) => [c.left, c.right])

describe('alignColumns — by header', () => {
  const left = [
    ['Region', 'Q1', 'Q2'],
    ['North', 1, 2]
  ]

  it('pairs identical headers one for one', () => {
    expect(pairs(alignColumns(left, left))).toEqual([
      [0, 0],
      [1, 1],
      [2, 2]
    ])
  })

  it('keeps the surviving columns paired across an insert', () => {
    const right = [
      ['Region', 'Q1', 'Forecast', 'Q2'],
      ['North', 1, 9, 2]
    ]
    expect(pairs(alignColumns(left, right))).toEqual([
      [0, 0],
      [1, 1],
      [null, 2], // Forecast is new
      [2, 3] // Q2 still lines up with Q2
    ])
  })

  it('reports a dropped column without shifting the rest', () => {
    const right = [
      ['Region', 'Q2'],
      ['North', 2]
    ]
    expect(pairs(alignColumns(left, right))).toEqual([
      [0, 0],
      [1, null],
      [2, 1]
    ])
  })

  // A renamed column is a different column: nothing else claims to know that
  // "Q2" and "Q2 actual" are the same figure.
  it('treats a renamed column as one removed and one added', () => {
    const right = [
      ['Region', 'Q1', 'Q2 actual'],
      ['North', 1, 2]
    ]
    const cols = alignColumns(left, right)
    expect(cols.filter((c) => c.left === null)).toHaveLength(1)
    expect(cols.filter((c) => c.right === null)).toHaveLength(1)
  })

  it('carries the header name for each aligned column', () => {
    const right = [
      ['Region', 'Q1', 'Forecast', 'Q2'],
      ['North', 1, 9, 2]
    ]
    expect(alignColumns(left, right).map((c) => c.name)).toEqual(['Region', 'Q1', 'Forecast', 'Q2'])
  })
})

describe('alignColumns — positional fallback', () => {
  it('falls back when a header label is blank', () => {
    const l = [
      ['A', '', 'C'],
      [1, 2, 3]
    ]
    const r = [
      ['A', 'B', 'C'],
      [1, 2, 3]
    ]
    expect(pairs(alignColumns(l, r))).toEqual([
      [0, 0],
      [1, 1],
      [2, 2]
    ])
  })

  it('falls back when a header label repeats', () => {
    const l = [
      ['A', 'A'],
      [1, 2]
    ]
    const r = [
      ['A', 'B'],
      [1, 2]
    ]
    expect(pairs(alignColumns(l, r))).toEqual([
      [0, 0],
      [1, 1]
    ])
  })

  // Two sheets of `row-0 | v0` against `row-0 | w0`: read as headers, column B
  // pairs with nothing and stops being compared at all. Pairing a minority of
  // the columns is the tell that the row was data.
  it('falls back when the headers pair only a minority of columns', () => {
    const l = [
      ['row-0', 'v0'],
      ['row-1', 'v1']
    ]
    const r = [
      ['row-0', 'w0'],
      ['row-1', 'w1']
    ]
    expect(pairs(alignColumns(l, r))).toEqual([
      [0, 0],
      [1, 1]
    ])
  })

  // One row is data, not a header: a header describes the rows beneath it.
  it('falls back for a single-row sheet', () => {
    expect(pairs(alignColumns([['x', 'y']], [['x', 'z']]))).toEqual([
      [0, 0],
      [1, 1]
    ])
  })

  it('marks the surplus columns of a wider side as one-sided', () => {
    expect(pairs(alignColumns([[1, 2]], [[1, 2, 3]]))).toEqual([
      [0, 0],
      [1, 1],
      [null, 2]
    ])
  })

  it('handles an empty sheet on either side', () => {
    expect(pairs(alignColumns([], [[1, 2]]))).toEqual([
      [null, 0],
      [null, 1]
    ])
    expect(alignColumns([], [])).toEqual([])
  })

  // The header row can be narrower than the data under it.
  it('measures width from the widest row, not the header', () => {
    expect(alignColumns([['A'], [1, 2, 3]], [['A'], [1, 2, 3]])).toHaveLength(3)
  })
})

// A title row above the header is the shape every exported pack has, and it used
// to drop the whole sheet to positional pairing — the exact failure header
// pairing exists to prevent.
describe('alignColumns — header below a title row', () => {
  const left = [
    ['Trial balance as at 31 Dec 2024'],
    ['Account', 'Debit', 'Credit'],
    ['1001', 500, 0],
    ['1002', 0, 300]
  ]

  it('finds the header under a title row and keeps an insert from shifting', () => {
    const right = [
      ['Trial balance as at 31 Dec 2025'],
      ['Account', 'Debit', 'Note', 'Credit'],
      ['1001', 500, '', 0],
      ['1002', 0, '', 300]
    ]
    expect(pairs(alignColumns(left, right))).toEqual([
      [0, 0],
      [1, 1],
      [null, 2],
      [2, 3]
    ])
  })

  // Each of these inserts a column, so header pairing and positional pairing
  // give different answers and the assertion can tell them apart.
  it('pairs when only one side carries the title row', () => {
    const right = [
      ['Account', 'Debit', 'Note', 'Credit'],
      ['1001', 500, '', 0],
      ['1002', 0, '', 300]
    ]
    expect(pairs(alignColumns(left, right))).toEqual([
      [0, 0],
      [1, 1],
      [null, 2],
      [2, 3]
    ])
  })

  it('skips blank rows on the way down', () => {
    const l = [['Q3 pack'], [], ['Region', 'Q1', 'Q2'], ['North', 1, 2], ['South', 3, 4]]
    const r = [
      ['Region', 'New', 'Q1', 'Q2'],
      ['North', 9, 1, 2],
      ['South', 9, 3, 4]
    ]
    expect(pairs(alignColumns(l, r))).toEqual([
      [0, 0],
      [null, 1],
      [1, 2],
      [2, 3]
    ])
  })

  it('gives up rather than scanning an unbounded preamble', () => {
    const preamble = Array.from({ length: 12 }, (_, i) => [`note ${i}`])
    const l = [...preamble, ['Region', 'Q1', 'Q2'], ['North', 1, 2]]
    const r = [...preamble, ['Region', 'New', 'Q1', 'Q2'], ['North', 9, 1, 2]]
    expect(pairs(alignColumns(l, r))).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [null, 3]
    ])
  })

  it('names the columns from the header it found, not from the title row', () => {
    const right = [
      ['Trial balance as at 31 Dec 2025'],
      ['Account', 'Debit', 'Credit'],
      ['1001', 500, 0],
      ['1002', 0, 300]
    ]
    expect(alignColumns(left, right).map((c) => c.name)).toEqual(['Account', 'Debit', 'Credit'])
  })
})

describe('headerPairing', () => {
  it('reports the row each side was read from', () => {
    const l = [['Pack'], ['Region', 'Q1'], ['North', 1], ['South', 2]]
    const r = [
      ['Region', 'Q1'],
      ['North', 1],
      ['South', 2]
    ]
    expect(headerPairing(l, r).headerRows).toEqual({ left: 1, right: 0 })
  })

  // Naming a header row the pairing did not use would tell the reader the
  // columns were matched by name when they were matched by position.
  it('reports no header row when the pairing fell back to position', () => {
    const l = [
      ['row-0', 'v0'],
      ['row-1', 'v1']
    ]
    const r = [
      ['row-0', 'w0'],
      ['row-1', 'w1']
    ]
    expect(headerPairing(l, r).headerRows).toBeNull()
  })

  it('returns the same columns alignColumns does', () => {
    const l = [
      ['Region', 'Q1'],
      ['North', 1]
    ]
    const r = [
      ['Region', 'Q2'],
      ['North', 2]
    ]
    expect(headerPairing(l, r).columns).toEqual(alignColumns(l, r))
  })
})

describe('pairedColumns', () => {
  it('keeps only the columns a diff can compare', () => {
    const cols = [
      { left: 0, right: 0, name: 'A' },
      { left: null, right: 1, name: 'B' },
      { left: 1, right: 2, name: 'C' },
      { left: 2, right: null, name: 'D' }
    ]
    expect(pairedColumns(cols).map((c) => c.name)).toEqual(['A', 'C'])
  })
})
