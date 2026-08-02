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
    expect(s.columns).toHaveLength(2)
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

describe('diffWorkbooks — column alignment', () => {
  // Insert one column and every column after it shifts, so a values-only
  // comparison reported the whole right-hand side of the sheet as changed.
  const left = [
    sheet('S', [
      ['Region', 'Q1', 'Q2'],
      ['North', 10, 20]
    ])
  ]
  const right = [
    sheet('S', [
      ['Region', 'Q1', 'Forecast', 'Q2'],
      ['North', 10, 99, 20]
    ])
  ]

  it('reports the inserted column once, not as a change on every row', () => {
    const [s] = diffWorkbooks(left, right)
    expect(s.stats.changed).toBe(0)
    expect(s.columnsAdded).toBe(1)
    expect(s.columnsRemoved).toBe(0)
  })

  it('lines the surviving columns up with each other', () => {
    const [s] = diffWorkbooks(left, right)
    // Four display columns; "Forecast" exists only on the right.
    expect(s.columns.map((c) => c.name)).toEqual(['Region', 'Q1', 'Forecast', 'Q2'])
    expect(s.columns.map((c) => c.left)).toEqual([0, 1, null, 2])
    expect(s.columns.map((c) => c.right)).toEqual([0, 1, 2, 3])
  })

  it('still finds a real cell change once the columns line up', () => {
    const moved = [
      sheet('S', [
        ['Region', 'Q1', 'Forecast', 'Q2'],
        ['North', 10, 99, 25]
      ])
    ]
    const [s] = diffWorkbooks(left, moved)
    expect(s.stats.changed).toBe(1)
    expect(s.rows[1].changed).toEqual([3]) // Q2, at its ALIGNED index
  })

  it('reports a removed column from the left', () => {
    const [s] = diffWorkbooks(right, left)
    expect(s.columnsRemoved).toBe(1)
    expect(s.stats.changed).toBe(0)
  })
})

describe('diffWorkbooks — materiality tolerance', () => {
  const left = [
    sheet('S', [
      ['Metric', 'Value'],
      ['Revenue', 1000],
      ['Costs', 500.004]
    ])
  ]
  const right = [
    sheet('S', [
      ['Metric', 'Value'],
      ['Revenue', 1004],
      ['Costs', 500]
    ])
  ]

  it('counts everything when the tolerance is exact', () => {
    expect(diffWorkbooks(left, right)[0].stats.changed).toBe(2)
  })

  it('drops a difference under the absolute floor', () => {
    const [s] = diffWorkbooks(left, right, { tolerance: { abs: 0.01 } })
    expect(s.stats.changed).toBe(1) // 500.004 vs 500 forgiven, 1000 vs 1004 not
  })

  it('drops a difference under the relative threshold', () => {
    const [s] = diffWorkbooks(left, right, { tolerance: { pct: 1 } })
    expect(s.stats.changed).toBe(0) // 0.4% and 0.0008% both under 1%
  })

  // A tolerance is a statement about amounts. Left to run on the serial behind a
  // date, 1% of 45870 forgives well over a year.
  const dated = (serial) => ({
    name: 'S',
    rows: [
      ['Invoice', 'Due'],
      ['INV-1', serial]
    ],
    cells: [[1, 1, { d: '2025-08-01', dt: true }]]
  })

  it('never forgives a date that moved, however generous the threshold', () => {
    const [s] = diffWorkbooks([dated(45870)], [dated(46100)], { tolerance: { pct: 1 } })
    expect(s.stats.changed).toBe(1)
    expect(s.rows[1].changed).toEqual([1])
    expect(s.rows[1].formulaChanged).toEqual([])
  })

  it('still reports a date that did not move as unchanged', () => {
    const [s] = diffWorkbooks([dated(45870)], [dated(45870)], { tolerance: { pct: 1 } })
    expect(s.stats.changed).toBe(0)
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
