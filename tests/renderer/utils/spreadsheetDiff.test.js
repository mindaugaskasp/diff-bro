import { describe, expect, it } from 'vitest'
import {
  diffWorkbooks,
  columnName
} from '../../../src/renderer/src/utils/spreadsheetDiff'

const sheet = (name, rows) => ({ name, rows })

describe('columnName', () => {
  it('maps 0-based indices to spreadsheet column letters', () => {
    expect(columnName(0)).toBe('A')
    expect(columnName(25)).toBe('Z')
    expect(columnName(26)).toBe('AA')
    expect(columnName(27)).toBe('AB')
    expect(columnName(701)).toBe('ZZ')
  })
})

describe('diffWorkbooks', () => {
  it('pairs sheets by name and rolls up per-sheet stats', () => {
    const left = [
      sheet('Budget', [
        ['a', 1],
        ['b', 2],
        ['c', 3]
      ])
    ]
    const right = [
      sheet('Budget', [
        ['a', 1],
        ['b', 9],
        ['d', 4]
      ])
    ]
    const [s] = diffWorkbooks(left, right)
    expect(s.present).toBe('both')
    expect(s.stats).toEqual({ changed: 1, added: 1, removed: 1 })
    expect(s.changes).toBe(3)
    expect(s.columns).toBe(2)
  })

  it('flags a sheet present in only the left file', () => {
    const [s] = diffWorkbooks([sheet('Only', [['x']])], [])
    expect(s.present).toBe('left')
    expect(s.stats).toEqual({ changed: 0, added: 0, removed: 1 })
    expect(s.rows[0].status).toBe('removed')
  })

  it('flags a sheet present in only the right file', () => {
    const [s] = diffWorkbooks([], [sheet('New', [['x'], ['y']])])
    expect(s.present).toBe('right')
    expect(s.stats).toEqual({ changed: 0, added: 2, removed: 0 })
    expect(s.rows.every((r) => r.status === 'added')).toBe(true)
  })

  it('keeps sheet order: left sheets first, then right-only sheets', () => {
    const left = [sheet('A', [['1']]), sheet('B', [['2']])]
    const right = [sheet('B', [['2']]), sheet('C', [['3']])]
    expect(diffWorkbooks(left, right).map((s) => s.name)).toEqual(['A', 'B', 'C'])
  })
})

