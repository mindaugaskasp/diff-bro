import { describe, it, expect } from 'vitest'
import {
  buildRowPlan,
  changeRows,
  lineSpanOf,
  rowsIn,
  runIndexAt,
  runStartRow
} from '../../../src/renderer/src/utils/streamRows'

// [same, leftStart, leftCount, rightStart, rightCount]
const same = (ls, n, rs) => [1, ls, n, rs, n]
const diff = (ls, ln, rs, rn) => [0, ls, ln, rs, rn]
const plan = (...runs) => buildRowPlan(runs.flat())

describe('buildRowPlan', () => {
  it('handles an empty alignment', () => {
    const p = buildRowPlan([])
    expect(p).toMatchObject({ total: 0, count: 0 })
    expect(rowsIn(p, 0, 10)).toEqual([])
  })

  it('measures a same run by its line count', () => {
    expect(plan(same(0, 5, 0)).total).toBe(5)
  })

  it('measures a diff run by its TALLER side, so both fit side by side', () => {
    expect(plan(diff(0, 2, 0, 7)).total).toBe(7)
    expect(plan(diff(0, 9, 0, 3)).total).toBe(9)
  })

  it('accepts an Int32Array straight off the IPC boundary', () => {
    const p = buildRowPlan(Int32Array.from(same(0, 4, 0)))
    expect(p.total).toBe(4)
  })

  it('adds run heights into a cumulative index', () => {
    const p = plan(same(0, 3, 0), diff(3, 2, 3, 5), same(5, 4, 8))
    expect(p.total).toBe(3 + 5 + 4)
    expect([...p.starts]).toEqual([0, 3, 8, 12])
  })
})

describe('runIndexAt', () => {
  const p = plan(same(0, 3, 0), diff(3, 2, 3, 5), same(5, 4, 8))

  it('finds the run holding each row', () => {
    expect([0, 1, 2].map((r) => runIndexAt(p, r))).toEqual([0, 0, 0])
    expect([3, 7].map((r) => runIndexAt(p, r))).toEqual([1, 1])
    expect([8, 11].map((r) => runIndexAt(p, r))).toEqual([2, 2])
  })

  it('refuses rows outside the plan', () => {
    expect(runIndexAt(p, -1)).toBe(-1)
    expect(runIndexAt(p, 12)).toBe(-1)
  })
})

describe('rowsIn', () => {
  it('pairs equal lines on the same row', () => {
    expect(rowsIn(plan(same(10, 2, 40)), 0, 2)).toEqual([
      { status: 'same', leftLine: 10, rightLine: 40 },
      { status: 'same', leftLine: 11, rightLine: 41 }
    ])
  })

  it('marks a paired replacement as changed', () => {
    expect(rowsIn(plan(diff(0, 2, 0, 2)), 0, 2)).toEqual([
      { status: 'chg', leftLine: 0, rightLine: 0 },
      { status: 'chg', leftLine: 1, rightLine: 1 }
    ])
  })

  it('leaves the empty side null on an uneven replacement', () => {
    expect(rowsIn(plan(diff(0, 1, 0, 3)), 0, 3)).toEqual([
      { status: 'chg', leftLine: 0, rightLine: 0 },
      { status: 'ins', leftLine: null, rightLine: 1 },
      { status: 'ins', leftLine: null, rightLine: 2 }
    ])
  })

  it('reads a pure deletion as del rows with no right line', () => {
    expect(rowsIn(plan(diff(4, 2, 9, 0)), 0, 2)).toEqual([
      { status: 'del', leftLine: 4, rightLine: null },
      { status: 'del', leftLine: 5, rightLine: null }
    ])
  })

  it('reads a pure insertion as ins rows with no left line', () => {
    expect(rowsIn(plan(diff(4, 0, 9, 2)), 0, 2)).toEqual([
      { status: 'ins', leftLine: null, rightLine: 9 },
      { status: 'ins', leftLine: null, rightLine: 10 }
    ])
  })

  it('serves an interior window that spans a run boundary', () => {
    const p = plan(same(0, 3, 0), diff(3, 1, 3, 1), same(4, 3, 4))
    expect(rowsIn(p, 2, 5)).toEqual([
      { status: 'same', leftLine: 2, rightLine: 2 },
      { status: 'chg', leftLine: 3, rightLine: 3 },
      { status: 'same', leftLine: 4, rightLine: 4 }
    ])
  })

  it('clamps a window that runs past the end', () => {
    const p = plan(same(0, 3, 0))
    expect(rowsIn(p, 1, 99)).toHaveLength(2)
    expect(rowsIn(p, 5, 9)).toEqual([])
    expect(rowsIn(p, 3, 1)).toEqual([])
  })

  it('agrees with a row-by-row walk across many runs', () => {
    const runs = []
    for (let k = 0; k < 200; k++) runs.push(same(k * 4, 3, k * 4), diff(k * 4 + 3, 1, k * 4 + 3, 1))
    const p = plan(...runs)
    const all = rowsIn(p, 0, p.total)
    expect(all).toHaveLength(p.total)
    for (let row = 0; row < p.total; row++) {
      expect(rowsIn(p, row, row + 1)[0]).toEqual(all[row])
    }
  })

  it('keeps left line numbers strictly increasing across the whole plan', () => {
    const p = plan(same(0, 3, 0), diff(3, 4, 3, 1), same(7, 2, 4))
    let previous = -1
    for (const row of rowsIn(p, 0, p.total)) {
      if (row.leftLine === null) continue
      expect(row.leftLine).toBeGreaterThan(previous)
      previous = row.leftLine
    }
  })
})

describe('lineSpanOf', () => {
  const p = plan(same(0, 3, 10), diff(3, 2, 13, 4))

  it('bounds the lines a window needs from each side', () => {
    const rows = rowsIn(p, 0, p.total)
    expect(lineSpanOf(rows, 'left')).toEqual({ from: 0, to: 5 })
    expect(lineSpanOf(rows, 'right')).toEqual({ from: 10, to: 17 })
  })

  it('is null for a side with no line in the window', () => {
    const rows = rowsIn(plan(diff(0, 0, 0, 3)), 0, 3)
    expect(lineSpanOf(rows, 'left')).toBeNull()
    expect(lineSpanOf(rows, 'right')).toEqual({ from: 0, to: 3 })
  })

  it('is null for an empty window', () => {
    expect(lineSpanOf([], 'left')).toBeNull()
  })

  it('spans across a gap where the side is absent for some rows', () => {
    const rows = rowsIn(plan(diff(0, 1, 0, 4)), 0, 4)
    expect(lineSpanOf(rows, 'left')).toEqual({ from: 0, to: 1 })
  })
})

describe('changeRows', () => {
  it('lists the row each changed block starts at', () => {
    const p = plan(same(0, 3, 0), diff(3, 1, 3, 1), same(4, 2, 4), diff(6, 1, 6, 1))
    expect(changeRows(p)).toEqual([3, 6])
  })

  it('is empty for an identical comparison', () => {
    expect(changeRows(plan(same(0, 9, 0)))).toEqual([])
  })

  it('caps the list so a million-change file stays navigable', () => {
    const runs = []
    for (let k = 0; k < 500; k++) runs.push(diff(k, 1, k, 1), same(k, 1, k))
    expect(changeRows(plan(...runs), 10)).toHaveLength(10)
  })
})

describe('runStartRow', () => {
  it('reports where a run begins', () => {
    const p = plan(same(0, 3, 0), diff(3, 1, 3, 1))
    expect(runStartRow(p, 0)).toBe(0)
    expect(runStartRow(p, 1)).toBe(3)
  })
})
