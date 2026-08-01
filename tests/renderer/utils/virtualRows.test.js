// The arithmetic behind every long list in the app. Exactness matters twice
// over: the spacers have to add up to the same scroll height the full list
// would have, and BOTH spreadsheet grids are driven by one window — a window
// that drifts pulls the two sides out of alignment.
import { describe, expect, it } from 'vitest'
import {
  GRID_ROW_H,
  OVERSCAN,
  SD_ROW_H,
  rowWindow
} from '../../../src/renderer/src/utils/virtualRows'

const view = (over = {}) => ({
  total: 1000,
  rowHeight: 20,
  scrollTop: 0,
  viewportHeight: 400,
  ...over
})

describe('rowWindow', () => {
  it('renders a screenful plus overscan at the top', () => {
    const w = rowWindow(view())
    expect(w.start).toBe(0)
    expect(w.end).toBe(400 / 20 + OVERSCAN * 2)
    expect(w.padTop).toBe(0)
  })

  // The whole point: the spacers stand in for every row not drawn, so the
  // scrollbar measures the full list.
  it('the window plus its spacers is always the full list height', () => {
    for (const scrollTop of [0, 137, 4000, 19_600]) {
      const w = rowWindow(view({ scrollTop }))
      expect(w.padTop + (w.end - w.start) * 20 + w.padBottom).toBe(1000 * 20)
    }
  })

  it('follows the scroll, keeping overscan behind it', () => {
    const w = rowWindow(view({ scrollTop: 4000 }))
    expect(w.start).toBe(4000 / 20 - OVERSCAN)
    expect(w.padTop).toBe(w.start * 20)
  })

  it('stops at the end rather than running past it', () => {
    const w = rowWindow(view({ scrollTop: 1000 * 20 }))
    expect(w.end).toBe(1000)
    expect(w.padBottom).toBe(0)
  })

  // A pane that has not been laid out yet reports 0. Rendering "all of them"
  // at that moment is exactly the freeze this exists to prevent.
  it('renders a bounded first page before the pane is measurable', () => {
    const w = rowWindow(view({ viewportHeight: 0 }))
    expect(w.start).toBe(0)
    expect(w.end).toBeGreaterThan(0)
    expect(w.end).toBeLessThan(1000)
    expect(w.padTop + (w.end - w.start) * 20 + w.padBottom).toBe(1000 * 20)
  })

  it('survives an empty list and a nonsense row height', () => {
    expect(rowWindow(view({ total: 0 }))).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 })
    expect(rowWindow(view({ rowHeight: 0 })).end).toBe(1000)
  })

  // A scroll position past the content (rubber-banding, a shrunk list) must not
  // produce a negative spacer.
  it('never produces a negative spacer', () => {
    const w = rowWindow(view({ scrollTop: 999_999 }))
    expect(w.padTop).toBeGreaterThanOrEqual(0)
    expect(w.padBottom).toBeGreaterThanOrEqual(0)
    expect(w.end).toBeLessThanOrEqual(1000)
  })
})

// These are bound into each viewer's CSS by the component, so a change here
// moves the layout with it. They are asserted so a stray edit is visible.
describe('the row heights the viewers are built on', () => {
  it('are the measured heights of a structure row and a grid row', () => {
    expect(SD_ROW_H).toBe(22)
    expect(GRID_ROW_H).toBe(24)
  })
})
