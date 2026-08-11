// The take buttons' geometry. Real Monaco moves these on every scroll and every
// edit; what is testable without one is which regions get a button, where it
// lands, and what gets clipped.
import { describe, expect, it } from 'vitest'
import { takeButtons } from '../../../../src/renderer/src/features/merge/mergeTakeOverlay'

// 20px lines, the way the editor lays them out.
const topOf = (line) => (line - 1) * 20

const view = (over) => ({
  anchors: [
    { line: 2, count: 2 },
    { line: 10, count: 1 }
  ],
  topOf,
  scrollTop: 0,
  height: 400,
  current: 0,
  ...over
})

describe('takeButtons', () => {
  it('puts one button at the top of each band', () => {
    expect(takeButtons(view())).toEqual([
      { index: 0, top: 20, dim: false },
      { index: 1, top: 180, dim: true }
    ])
  })

  it('keeps the index of the region, not of the button', () => {
    const anchors = [null, { line: 4, count: 1 }]
    expect(takeButtons(view({ anchors }))).toEqual([{ index: 1, top: 60, dim: true }])
  })

  // The side deleted those lines, so there is no band and nothing to take.
  it('draws nothing for a region the side does not contain', () => {
    expect(takeButtons(view({ anchors: [null, null] }))).toEqual([])
  })

  it('follows the scroll', () => {
    expect(takeButtons(view({ scrollTop: 10 }))).toEqual([
      { index: 0, top: 10, dim: false },
      { index: 1, top: 170, dim: true }
    ])
  })

  // Left in the DOM it would still be focusable, which is how an overlay button
  // ends up floating over the pane header.
  it('drops a button scrolled out of the pane', () => {
    expect(takeButtons(view({ scrollTop: 185 })).map((b) => b.index)).toEqual([1])
  })

  it('drops a button below the fold', () => {
    expect(takeButtons(view({ height: 100 })).map((b) => b.index)).toEqual([0])
  })

  // Half a button over the top edge is still worth showing: the band it belongs
  // to is on screen even when its first line is not quite.
  it('keeps a button straddling the top edge', () => {
    expect(takeButtons(view({ scrollTop: 28 }))[0]).toEqual({ index: 0, top: -8, dim: false })
    expect(takeButtons(view({ scrollTop: 32 })).map((b) => b.index)).toEqual([1])
  })

  it('marks every region but the current one as receding', () => {
    expect(takeButtons(view({ current: 1 })).map((b) => b.dim)).toEqual([true, false])
  })

  it('answers nothing when the side has no anchors yet', () => {
    expect(takeButtons(view({ anchors: undefined }))).toEqual([])
  })
})
