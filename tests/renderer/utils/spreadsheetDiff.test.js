import { describe, expect, it } from 'vitest'
import { diffWorkbooks, columnName } from '../../../src/renderer/src/utils/spreadsheetDiff'

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

describe('diffWorkbooks — formulas', () => {
  // The bug the roadmap names: a formula replaced by its own cached value leaves
  // every displayed number identical, so a value-only diff reported "unchanged".
  it('reports a formula hardcoded to its own cached value as changed', () => {
    const left = [
      { name: 'S', rows: [[10, 20, 30]], cells: [[0, 2, { f: 'A1+B1', n: 'RC[-2]+RC[-1]' }]] }
    ]
    const right = [{ name: 'S', rows: [[10, 20, 30]], cells: [] }]
    const [s] = diffWorkbooks(left, right)
    expect(s.stats.changed).toBe(1)
    expect(s.rows[0].formulaChanged).toEqual([2])
    expect(s.rows[0].changed).toEqual([])
  })

  // R1C1 normalisation: an inserted row rewrites every A1 formula below it, and
  // comparing the raw text would flag all of them.
  it('treats a row-shifted formula as unchanged once normalised', () => {
    const left = [{ name: 'S', rows: [[1], [2]], cells: [[1, 0, { f: 'A1*2', n: 'R[-1]C*2' }]] }]
    const right = [{ name: 'S', rows: [[1], [2]], cells: [[1, 0, { f: 'A1*2', n: 'R[-1]C*2' }]] }]
    expect(diffWorkbooks(left, right)[0].stats.changed).toBe(0)
  })

  it('flags a changed value and a changed formula separately', () => {
    const left = [{ name: 'S', rows: [[1, 2]], cells: [[0, 1, { f: 'A1+1', n: 'RC[-1]+1' }]] }]
    const right = [{ name: 'S', rows: [[1, 5]], cells: [[0, 1, { f: 'A1+4', n: 'RC[-1]+4' }]] }]
    const [s] = diffWorkbooks(left, right)
    expect(s.rows[0].changed).toEqual([1])
    expect(s.rows[0].formulaChanged).toEqual([])
  })

  it('distinguishes an error cell from text that reads the same', () => {
    const left = [{ name: 'S', rows: [['#REF!']], cells: [[0, 0, { e: true }]] }]
    const right = [{ name: 'S', rows: [['#REF!']], cells: [] }]
    expect(diffWorkbooks(left, right)[0].stats.changed).toBe(1)
  })
})

describe('diffWorkbooks — sheet state', () => {
  it('carries hidden sheet state and per-side hidden rows through', () => {
    const left = [{ name: 'S', rows: [['a'], ['b']], hidden: true, hiddenRows: [1] }]
    const right = [{ name: 'S', rows: [['a'], ['b']], hiddenRows: [] }]
    const [s] = diffWorkbooks(left, right)
    expect(s.hidden).toBe(true)
    expect(s.leftHidden.has(1)).toBe(true)
    expect(s.rightHidden.has(1)).toBe(false)
  })
})
