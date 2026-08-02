import { afterEach, describe, expect, it } from 'vitest'
import {
  elementScroller,
  getDiffScroller,
  monacoDiffScroller,
  monacoScroller,
  selectedBand,
  setDiffScroller
} from '../../../src/renderer/src/utils/diffScroller'

afterEach(() => setDiffScroller(null))

describe('the diff scroller registry', () => {
  it('hands back whatever the viewer registered, and nothing once it unmounts', () => {
    const api = { contentHeight: () => 1 }
    setDiffScroller(api)
    expect(getDiffScroller()).toBe(api)
    setDiffScroller(null)
    expect(getDiffScroller()).toBeNull()
  })

  it('is empty before any viewer has mounted', () => {
    expect(getDiffScroller()).toBeNull()
  })
})

describe('monacoScroller', () => {
  const pane = {
    getScrollHeight: () => 4200,
    getLayoutInfo: () => ({ height: 640 }),
    getScrollTop: () => 120,
    setScrollTop(top) {
      this.wrote = top
    }
  }

  it('reads the pane through Monaco, not the DOM', () => {
    const s = monacoScroller(() => pane)
    expect(s.contentHeight()).toBe(4200)
    expect(s.viewportHeight()).toBe(640)
    expect(s.scrollTop()).toBe(120)
    s.scrollTo(900)
    expect(pane.wrote).toBe(900)
  })

  // Every model swap replaces the pane object, so resolving it up front would
  // leave the export scrolling an editor that is no longer on screen.
  it('resolves the pane on each call', () => {
    let current = { getScrollHeight: () => 1 }
    const s = monacoScroller(() => current)
    expect(s.contentHeight()).toBe(1)
    current = { getScrollHeight: () => 2 }
    expect(s.contentHeight()).toBe(2)
  })
})

// Monaco's line tops, 20px a line, so a band can be read back exactly.
const paneWith = (selection) => ({
  getSelection: () => selection,
  getTopForLineNumber: (n) => (n - 1) * 20,
  getScrollHeight: () => 4200,
  getLayoutInfo: () => ({ height: 640 }),
  getScrollTop: () => 0,
  setScrollTop: () => {}
})
const sel = (start, end, empty = false) => ({
  startLineNumber: start,
  endLineNumber: end,
  isEmpty: () => empty
})

describe('selectedBand', () => {
  it('spans from the first selected line to the bottom of the last', () => {
    expect(selectedBand(paneWith(sel(3, 6)))).toEqual({ top: 40, bottom: 120 })
  })

  it('covers a single selected line rather than nothing', () => {
    expect(selectedBand(paneWith(sel(3, 3)))).toEqual({ top: 40, bottom: 60 })
  })

  // Dragging upward reports the anchor as the end.
  it('reads a backwards selection the same as a forwards one', () => {
    expect(selectedBand(paneWith(sel(6, 3)))).toEqual({ top: 40, bottom: 120 })
  })

  it('ignores a bare caret — a click is not a choice of lines', () => {
    expect(selectedBand(paneWith(sel(3, 3, true)))).toBeNull()
  })

  it('ignores a pane with no selection at all', () => {
    expect(selectedBand(paneWith(null))).toBeNull()
    expect(selectedBand(undefined)).toBeNull()
  })
})

describe('monacoScroller selection', () => {
  it('takes the band from whichever pane has one', () => {
    const left = paneWith(sel(1, 1, true))
    const right = paneWith(sel(4, 5))
    const s = monacoScroller(
      () => right,
      () => [left, right]
    )
    expect(s.selection()).toEqual({ top: 60, bottom: 100 })
  })

  it('reports none when neither pane has a selection', () => {
    const bare = paneWith(sel(1, 1, true))
    expect(
      monacoScroller(
        () => bare,
        () => [bare, bare]
      ).selection()
    ).toBeNull()
  })
})

describe('monacoDiffScroller', () => {
  it('scrolls by the modified pane and reads a selection from either', () => {
    const original = paneWith(sel(2, 3))
    const modified = paneWith(sel(1, 1, true))
    modified.getScrollHeight = () => 9999
    const s = monacoDiffScroller(() => ({
      getModifiedEditor: () => modified,
      getOriginalEditor: () => original
    }))
    expect(s.contentHeight()).toBe(9999)
    expect(s.selection()).toEqual({ top: 20, bottom: 60 })
  })
})

// Each pane of a diff editor keeps its own selection, so "whichever pane has
// one" silently preferred a stale band: selecting on the right, exporting, then
// selecting on the left re-exported the right pane's old lines.
const livePane = () => {
  const listeners = []
  const pane = {
    selection: null,
    getSelection: () => pane.selection,
    getTopForLineNumber: (n) => (n - 1) * 20,
    getScrollHeight: () => 4200,
    getLayoutInfo: () => ({ height: 640 }),
    getScrollTop: () => 0,
    setScrollTop: () => {},
    onDidChangeCursorSelection: (cb) => listeners.push(cb),
    choose(s) {
      pane.selection = s
      listeners.forEach((cb) => cb())
    }
  }
  return pane
}

describe('monacoDiffScroller selection freshness', () => {
  const build = () => {
    const modified = livePane()
    const original = livePane()
    const scroller = monacoDiffScroller(() => ({
      getModifiedEditor: () => modified,
      getOriginalEditor: () => original
    }))
    return { modified, original, scroller }
  }

  it('follows the pane the reader selected in most recently', () => {
    const { modified, original, scroller } = build()
    modified.choose(sel(3, 6))
    expect(scroller.selection()).toEqual({ top: 40, bottom: 120 })

    original.choose(sel(10, 11))
    expect(scroller.selection()).toEqual({ top: 180, bottom: 220 })
  })

  it('tracks a fresh selection within the same pane', () => {
    const { modified, scroller } = build()
    modified.choose(sel(3, 6))
    modified.choose(sel(20, 21))
    expect(scroller.selection()).toEqual({ top: 380, bottom: 420 })
  })

  // Collapsing to a caret is the reader saying "not those lines any more"; the
  // export must widen back to the whole diff rather than reuse what was there.
  it('reports none once the latest selection is collapsed', () => {
    const { modified, original, scroller } = build()
    original.choose(sel(2, 4))
    modified.choose(sel(3, 6))
    modified.choose(sel(8, 8, true))
    expect(scroller.selection()).toBeNull()
  })

  it('still finds a selection nobody has touched since mount', () => {
    const { original, scroller } = build()
    original.selection = sel(2, 3)
    expect(scroller.selection()).toEqual({ top: 20, bottom: 60 })
  })
})

// The grid viewer and the structure list are plain scrolling boxes with no
// Monaco behind them. Giving them the same contract is the whole of "stitch a
// picture of any scrollable region": the export already knows how to scroll a
// viewport at a time and join the shots.
describe('elementScroller', () => {
  const box = (over = {}) => ({
    scrollHeight: 2400,
    clientHeight: 600,
    scrollWidth: 900,
    clientWidth: 900,
    scrollTop: 0,
    ...over
  })

  it('reports the region\u2019s own scroll geometry', () => {
    const el = box()
    const s = elementScroller(() => el)
    expect(s.contentHeight()).toBe(2400)
    expect(s.viewportHeight()).toBe(600)
    expect(s.viewportEl()).toBe(el)
  })

  it('scrolls the element the export is stitching', () => {
    const el = box()
    const s = elementScroller(() => el)
    s.scrollTo(1200)
    expect(el.scrollTop).toBe(1200)
    expect(s.scrollTop()).toBe(1200)
  })

  // A grid has no line selection, so a picture of one is always the whole thing.
  it('never narrows the picture to a selection', () => {
    expect(elementScroller(() => box()).selection()).toBeNull()
  })

  // Stitching only scrolls DOWN. Columns off the right edge are simply not in
  // the picture, and a crop that looks complete is the one thing an export
  // must not hand over.
  it('counts the screenfuls of columns a picture cannot reach', () => {
    expect(elementScroller(() => box()).hiddenColumns()).toBe(0)
    expect(elementScroller(() => box({ scrollWidth: 2600 })).hiddenColumns()).toBe(2)
  })

  // Read lazily, so a re-render that swaps the node cannot leave the export
  // scrolling an element nobody can see.
  it('survives the element going away', () => {
    const s = elementScroller(() => null)
    expect(s.contentHeight()).toBe(0)
    expect(s.viewportEl()).toBeNull()
    expect(s.hiddenColumns()).toBe(0)
    expect(() => s.scrollTo(100)).not.toThrow()
  })
})
