import { describe, expect, it } from 'vitest'
import {
  cellText,
  comparableRows,
  displayValue,
  metaAt,
  metaIndex
} from '../../../src/renderer/src/utils/sheetCells'

const sheet = {
  name: 'S',
  rows: [
    [1, 2, 3],
    ['a', 45870, '#REF!']
  ],
  cells: [
    [0, 2, { f: 'A1+B1', n: 'RC[-2]+RC[-1]' }],
    [1, 1, { d: '2025-08-01' }],
    [1, 2, { e: true }]
  ]
}

describe('metaIndex / metaAt', () => {
  it('finds a cell by coordinate and answers null everywhere else', () => {
    const index = metaIndex(sheet)
    expect(metaAt(index, 0, 2).f).toBe('A1+B1')
    expect(metaAt(index, 1, 1).d).toBe('2025-08-01')
    expect(metaAt(index, 0, 0)).toBeNull()
    expect(metaAt(index, null, 0)).toBeNull()
  })

  it('shares one empty index for a sheet with no extras', () => {
    expect(metaIndex({ rows: [[1]] }).size).toBe(0)
    expect(metaIndex(null).size).toBe(0)
  })
})

describe('displayValue', () => {
  it('renders blanks and booleans the way a spreadsheet does', () => {
    expect(displayValue(null)).toBe('')
    expect(displayValue(undefined)).toBe('')
    expect(displayValue(true)).toBe('TRUE')
    expect(displayValue(false)).toBe('FALSE')
    expect(displayValue(0)).toBe('0')
  })
})

describe('cellText', () => {
  it('prefers the number format over the raw value', () => {
    expect(cellText(45870, { d: '2025-08-01' }, false)).toBe('2025-08-01')
  })

  it('shows the formula only when asked, and only where there is one', () => {
    const meta = { f: 'A1+B1', n: 'RC[-2]+RC[-1]' }
    expect(cellText(3, meta, true)).toBe('=A1+B1')
    expect(cellText(3, meta, false)).toBe('3')
    expect(cellText(3, null, true)).toBe('3')
  })
})

describe('comparableRows', () => {
  it('folds the formula and the error flag into the cell identity', () => {
    const [first, second] = comparableRows(sheet)
    expect(first).toEqual([1, 2, { v: 3, k: '=RC[-2]+RC[-1]' }])
    expect(second).toEqual(['a', 45870, { v: '#REF!', k: '#' }])
  })

  // A formula overwritten by its own cached value: same number, different cell.
  it('separates a formula cell from a literal holding the same value', () => {
    const [withFormula] = comparableRows(sheet)
    const [plain] = comparableRows({ rows: [[1, 2, 3]], cells: [] })
    expect(withFormula[2]).not.toBe(plain[2])
  })

  it('hands back the raw rows untouched when nothing is tagged', () => {
    const plain = { rows: [[1, 2]] }
    expect(comparableRows(plain)).toBe(plain.rows)
  })
})
