import { describe, expect, it } from 'vitest'
import { alignColumns, pairedColumns } from '../../../src/renderer/src/utils/alignColumns'

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
