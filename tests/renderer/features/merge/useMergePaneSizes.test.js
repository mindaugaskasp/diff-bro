import { beforeEach, describe, expect, it } from 'vitest'
import {
  normalise,
  paneColumns,
  splitAt,
  useMergePaneSizes
} from '../../../../src/renderer/src/features/merge/useMergePaneSizes'

const tracks = (s) => s.split(' ')

describe('paneColumns', () => {
  // Three panes and two grips are FIVE grid children. A three-track row leaves
  // the grips holding columns of their own and wraps Theirs onto a second row,
  // which is how the result pane ended up half height.
  it('gives every child a track, grips included', () => {
    expect(tracks(paneColumns(1 / 3, 1 / 3))).toHaveLength(5)
    expect(tracks(paneColumns(1 / 3, 1 / 3))[1]).toBe('0')
    expect(tracks(paneColumns(1 / 3, 1 / 3))[3]).toBe('0')
  })

  it('never emits a negative track', () => {
    for (const [ours, result] of [
      [0.5, 0.5],
      [0.8, 0.8],
      [0.12, 0.76]
    ]) {
      const safe = normalise(ours, result)
      const [a, , b, , c] = tracks(paneColumns(safe.ours, safe.result))
      for (const t of [a, b, c]) expect(parseFloat(t)).toBeGreaterThan(0)
    }
  })
})

describe('normalise', () => {
  it('keeps all three panes above the readable floor', () => {
    const { ours, result } = normalise(0.9, 0.9)
    expect(ours).toBeGreaterThanOrEqual(0.12)
    expect(result).toBeGreaterThanOrEqual(0.12)
    expect(1 - ours - result).toBeGreaterThanOrEqual(0.12 - 1e-9)
  })

  it('leaves a sane split alone', () => {
    expect(normalise(0.25, 0.5)).toEqual({ ours: 0.25, result: 0.5 })
  })
})

describe('splitAt', () => {
  // A divider moves between the two panes it touches; the third keeps its width.
  it('holds the moving edge inside the pair it divides', () => {
    expect(splitAt(0.6, 0.3)).toBeCloseTo(0.3)
    expect(splitAt(0.6, 0.9)).toBeCloseTo(0.48)
    expect(splitAt(0.6, -1)).toBeCloseTo(0.12)
  })
})

// The drag itself, without a pointer. What makes this worth a unit is the state
// BETWEEN the events, and the invariant a fr-track grid cannot express: three
// panes whose widths always sum to the row.
describe('the drag', () => {
  const grip = (x) => ({
    clientX: x,
    preventDefault: () => {},
    currentTarget: { parentElement: { clientWidth: 1000 } }
  })
  const widths = (s) =>
    s.columns.value
      .split(' ')
      .filter((t) => t !== '0')
      .map(parseFloat)

  beforeEach(() => {
    localStorage.clear()
    window.api = {}
  })

  it('moves the divider between the two panes it touches, leaving the third', () => {
    const s = useMergePaneSizes()
    const [, , theirsBefore] = widths(s)
    s.start('ours', grip(400))
    expect(s.resizing.value).toBe(true)
    window.dispatchEvent(new window.PointerEvent('pointermove', { clientX: 600 }))

    const [ours, result, theirs] = widths(s)
    expect(ours).toBeCloseTo(1 / 3 + 0.2, 3)
    expect(result).toBeCloseTo(1 / 3 - 0.2, 3)
    expect(theirs).toBeCloseTo(theirsBefore, 3)
  })

  // Dragged past the far pane, the fractions went negative and the grid dropped
  // a track — which is what put the result pane on a row of its own.
  it('never lets a pane fall below the readable floor, however far it is dragged', () => {
    const s = useMergePaneSizes()
    s.start('result', grip(400))
    window.dispatchEvent(new window.PointerEvent('pointermove', { clientX: 4000 }))
    for (const w of widths(s)) expect(w).toBeGreaterThanOrEqual(0.12 - 1e-9)
    expect(widths(s).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3)
  })

  // A drag is one decision, so it is written on release and not per frame.
  it('persists on release, and stops listening', () => {
    const s = useMergePaneSizes()
    s.start('ours', grip(400))
    window.dispatchEvent(new window.PointerEvent('pointermove', { clientX: 500 }))
    window.dispatchEvent(new window.PointerEvent('pointerup'))
    expect(s.resizing.value).toBe(false)
    expect(JSON.parse(localStorage.getItem('diffbro.mergePanes')).ours).toBeCloseTo(1 / 3 + 0.1, 3)

    const settled = s.columns.value
    window.dispatchEvent(new window.PointerEvent('pointermove', { clientX: 900 }))
    expect(s.columns.value).toBe(settled)
  })

  it('opens where the last drag left it', () => {
    localStorage.setItem('diffbro.mergePanes', JSON.stringify({ ours: 0.5, result: 0.25 }))
    expect(widths(useMergePaneSizes())).toEqual([0.5, 0.25, 0.25])
  })

  it('falls back to thirds on anything it cannot read', () => {
    localStorage.setItem('diffbro.mergePanes', 'not json')
    expect(widths(useMergePaneSizes())[0]).toBeCloseTo(1 / 3, 3)
    localStorage.setItem('diffbro.mergePanes', JSON.stringify({ ours: 'wide' }))
    expect(widths(useMergePaneSizes())[0]).toBeCloseTo(1 / 3, 3)
  })
})
