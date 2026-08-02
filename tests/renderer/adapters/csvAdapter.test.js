import { describe, expect, it } from 'vitest'
import { csvAdapter } from '../../../src/renderer/src/adapters/csvAdapter'
import { textAdapter } from '../../../src/renderer/src/adapters/textAdapter'
import { resolveAdapter } from '../../../src/renderer/src/adapters'

const file = (content, name = 'rows.csv') => ({ name, content })

describe('csvAdapter', () => {
  // Same rule as structureAdapter: a .csv is a text file until the reader says
  // otherwise, so auto-resolve must never hand it the grid.
  it('stays out of the auto-resolve registry', () => {
    expect(resolveAdapter(file('a,b\n1,2'))).toBe(textAdapter)
  })

  it('claims a side only once a delimiter has been decided', () => {
    expect(csvAdapter.matches(file('a,b'), ',')).toBe(true)
    expect(csvAdapter.matches(file('a,b'), null)).toBe(false)
    expect(csvAdapter.matches({ name: 'x.csv' }, ',')).toBe(false)
  })

  it('turns delimited text into a one-sheet grid', () => {
    expect(csvAdapter.toComparable(file('id,qty\n1,7'), ',')).toEqual({
      kind: 'spreadsheet',
      sheets: [
        {
          name: 'Data',
          rows: [
            ['id', 'qty'],
            [1, 7]
          ],
          cells: [],
          hiddenRows: [],
          truncated: false
        }
      ]
    })
  })

  // Sheets pair by name, and the two sides are two differently named files —
  // naming the sheet after the file left every row "removed" beside "added".
  it('gives both sides the same sheet name so they pair', () => {
    const left = csvAdapter.toComparable(file('a,b', 'left.csv'), ',')
    const right = csvAdapter.toComparable(file('a,b', 'right.csv'), ',')
    expect(left.sheets[0].name).toBe(right.sheets[0].name)
  })
})
