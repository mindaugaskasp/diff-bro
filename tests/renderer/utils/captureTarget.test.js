import { describe, expect, it } from 'vitest'
import {
  CAPTURE_SELECTOR,
  EDITOR_SELECTOR,
  afterFrames,
  captureRectOf,
  captureRegionOf,
  planSlices,
  untilChanged
} from '../../../src/renderer/src/utils/captureTarget'

// A stand-in for the diff column: its own box, plus the per-line boxes Monaco
// renders inside it (jsdom lays nothing out, so both are supplied).
function pageWith(rect, lineBottoms = []) {
  const el = rect && {
    getBoundingClientRect: () => rect,
    querySelectorAll: () =>
      lineBottoms.map((bottom) => ({
        getBoundingClientRect: () => ({ height: 19, bottom })
      }))
  }
  return { querySelector: (sel) => (sel === CAPTURE_SELECTOR ? el : null) }
}

const COLUMN = { left: 260.4, top: 88.6, width: 900.2, height: 640 }

describe('captureRectOf', () => {
  it('measures the diff column in whole CSS pixels', () => {
    const doc = pageWith(COLUMN, [700])
    expect(captureRectOf(doc)).toMatchObject({ x: 260, y: 89, width: 900 })
  })

  it('crops to just below the last rendered line', () => {
    // Lines end at y=300; the column runs to 728. 300 - 88.6 + 14 = 225.4.
    const doc = pageWith(COLUMN, [180, 260, 300])
    expect(captureRectOf(doc).height).toBe(225)
  })

  it('keeps the full column when the diff is taller than the pane', () => {
    // A line rendered past the column's bottom edge — never grow beyond it.
    const doc = pageWith(COLUMN, [2000])
    expect(captureRectOf(doc).height).toBe(640)
  })

  it('ignores zero-height lines when finding the bottom', () => {
    const withGhosts = {
      getBoundingClientRect: () => COLUMN,
      querySelectorAll: () => [
        { getBoundingClientRect: () => ({ height: 0, bottom: 9000 }) },
        { getBoundingClientRect: () => ({ height: 19, bottom: 300 }) }
      ]
    }
    const doc = { querySelector: () => withGhosts }
    expect(captureRectOf(doc).height).toBe(225)
  })

  it('never crops down to a sliver for a one-line diff', () => {
    const doc = pageWith(COLUMN, [100])
    expect(captureRectOf(doc).height).toBe(160)
  })

  it('falls back to the whole column when no lines are rendered', () => {
    expect(captureRectOf(pageWith(COLUMN, [])).height).toBe(640)
  })

  it('returns null when there is no diff column on the page', () => {
    expect(captureRectOf(pageWith(null))).toBeNull()
  })

  it('returns null for a collapsed element rather than a zero-size capture', () => {
    expect(captureRectOf(pageWith({ left: 0, top: 0, width: 0, height: 400 }))).toBeNull()
    expect(captureRectOf(pageWith({ left: 0, top: 0, width: 400, height: 0 }))).toBeNull()
  })

  it('reads the real document by default', () => {
    const div = document.createElement('div')
    div.className = 'content'
    document.body.append(div)
    // jsdom lays nothing out, so the rect is zero — the point is that it looked.
    expect(captureRectOf()).toBeNull()
    div.remove()
  })
})

describe('afterFrames', () => {
  it('waits for the requested number of frames before resolving', async () => {
    let frames = 0
    const win = {
      requestAnimationFrame: (cb) => {
        frames++
        setTimeout(cb, 0)
      }
    }
    await afterFrames(4, win)
    expect(frames).toBe(4)
  })

  it('always waits at least one frame', async () => {
    let frames = 0
    const win = {
      requestAnimationFrame: (cb) => {
        frames++
        setTimeout(cb, 0)
      }
    }
    await afterFrames(0, win)
    expect(frames).toBe(1)
  })
})

describe('untilChanged', () => {
  const frameWin = () => ({ requestAnimationFrame: (cb) => setTimeout(cb, 0) })

  it('waits for the value to change, however many frames that takes', async () => {
    let revision = 7
    let frames = 0
    const win = {
      requestAnimationFrame: (cb) => {
        frames++
        if (frames === 12) revision = 8
        setTimeout(cb, 0)
      }
    }
    await expect(untilChanged(() => revision, { win })).resolves.toBe(true)
    expect(frames).toBe(12)
  })

  it('gives up after the frame budget rather than hanging the shutter', async () => {
    await expect(untilChanged(() => 1, { frames: 5, win: frameWin() })).resolves.toBe(false)
  })

  it('still waits a frame when the value never had to change', async () => {
    let frames = 0
    const win = {
      requestAnimationFrame: (cb) => {
        frames++
        setTimeout(cb, 0)
      }
    }
    await untilChanged(() => 1, { frames: 3, win })
    expect(frames).toBe(3)
  })
})

describe('planSlices', () => {
  it('is a single slice when the diff already fits the pane', () => {
    const plan = planSlices({ contentHeight: 300, viewportHeight: 640 })
    expect(plan).toEqual({ slices: [{ scrollTop: 0, offsetY: 0, height: 300 }], truncated: false })
  })

  it('covers a tall diff with back-to-back viewports', () => {
    const { slices } = planSlices({ contentHeight: 1000, viewportHeight: 400 })
    expect(slices).toEqual([
      { scrollTop: 0, offsetY: 0, height: 400 },
      { scrollTop: 400, offsetY: 0, height: 400 },
      // Monaco refuses to scroll past contentHeight - viewportHeight, so the
      // last shot is taken at that clamp and only its BOTTOM strip is kept —
      // otherwise the tail would repeat lines already in the slice above.
      { scrollTop: 600, offsetY: 200, height: 200 }
    ])
  })

  it('covers the diff exactly — no gap, no overlap', () => {
    for (const contentHeight of [640, 641, 1279, 1280, 1281, 5000]) {
      const { slices } = planSlices({ contentHeight, viewportHeight: 640 })
      const covered = slices.reduce((n, s) => n + s.height, 0)
      expect(covered).toBe(contentHeight)
      for (const s of slices) {
        expect(s.scrollTop).toBeLessThanOrEqual(Math.max(0, contentHeight - 640))
        expect(s.offsetY + s.height).toBeLessThanOrEqual(640)
      }
    }
  })

  it('stops at the height ceiling and says so, rather than exhausting memory', () => {
    const plan = planSlices({ contentHeight: 10000, viewportHeight: 400, maxHeight: 1000 })
    expect(plan.truncated).toBe(true)
    expect(plan.slices.reduce((n, s) => n + s.height, 0)).toBe(1000)
  })

  it('does not claim truncation when the ceiling is exactly met', () => {
    expect(planSlices({ contentHeight: 800, viewportHeight: 400, maxHeight: 800 }).truncated).toBe(
      false
    )
  })

  it('returns nothing to shoot for an empty or unmeasurable viewer', () => {
    expect(planSlices({ contentHeight: 0, viewportHeight: 400 }).slices).toEqual([])
    expect(planSlices({ contentHeight: 500, viewportHeight: 0 }).slices).toEqual([])
  })
})

describe('captureRegionOf', () => {
  const columnWith = (paneRect) => ({
    querySelector: (sel) =>
      sel === CAPTURE_SELECTOR
        ? {
            getBoundingClientRect: () => COLUMN,
            querySelector: () => paneRect && { getBoundingClientRect: () => paneRect }
          }
        : null
  })

  it('reports the column and where Monaco starts inside it', () => {
    const doc = columnWith({ top: 140.7, height: 588 })
    expect(captureRegionOf({ doc })).toEqual({
      content: { x: 260, y: 89, width: 900, height: 640 },
      editorY: 141
    })
  })

  it('returns null when the column holds nothing that scrolls', () => {
    expect(captureRegionOf({ doc: columnWith(null) })).toBeNull()
    expect(captureRegionOf({ doc: columnWith({ top: 140, height: 0 }) })).toBeNull()
  })

  it('returns null when the diff column is not on screen', () => {
    expect(captureRegionOf({ doc: { querySelector: () => null } })).toBeNull()
  })

  // The grid viewer and the structure list have no .diff-container, so the
  // selector finds nothing — the scroller names its own box instead, which is
  // what lets any scrolling region be stitched rather than only Monaco.
  it('takes the viewport the scroller names, over the Monaco selector', () => {
    const doc = columnWith(null)
    const viewport = { getBoundingClientRect: () => ({ top: 300.4, height: 420 }) }
    expect(captureRegionOf({ viewport, doc })).toEqual({
      content: { x: 260, y: 89, width: 900, height: 640 },
      editorY: 300
    })
  })

  // The streamed viewer has no Monaco behind it; its row list must still be
  // found, or a streamed comparison could not be photographed at all.
  it('finds the streamed viewer’s row list as well as Monaco', () => {
    expect(EDITOR_SELECTOR).toContain('.diff-container')
    expect(EDITOR_SELECTOR).toContain('.stream-rows')
    const doc = {
      querySelector: (sel) =>
        sel === CAPTURE_SELECTOR
          ? {
              getBoundingClientRect: () => COLUMN,
              // Stands for a document where only .stream-rows exists: the
              // combined selector has to match it.
              querySelector: (inner) =>
                inner === EDITOR_SELECTOR
                  ? { getBoundingClientRect: () => ({ top: 150, height: 500 }) }
                  : null
            }
          : null
    }
    expect(captureRegionOf({ doc })).toMatchObject({ editorY: 150 })
  })
})

// Exporting a selected line range: the range arrives as content pixels, so the
// plan has to start partway down without ever scrolling past Monaco's clamp.
describe('planSlices over a selected range', () => {
  it('covers exactly the requested band when it fits one viewport', () => {
    const { slices, truncated } = planSlices({
      contentHeight: 5000,
      viewportHeight: 600,
      from: 1200
    })
    expect(truncated).toBe(false)
    expect(slices[0]).toEqual({ scrollTop: 1200, offsetY: 0, height: 600 })
  })

  it('runs from the range start to the end of the diff', () => {
    const { slices } = planSlices({ contentHeight: 1000, viewportHeight: 400, from: 250 })
    const covered = slices.reduce((n, s) => n + s.height, 0)
    expect(covered).toBe(750)
    expect(slices[0].scrollTop).toBe(250)
  })

  it('keeps the last strip inside the viewport when the scroll clamps', () => {
    const { slices } = planSlices({ contentHeight: 1000, viewportHeight: 400, from: 700 })
    for (const s of slices) {
      expect(s.scrollTop).toBeLessThanOrEqual(600)
      expect(s.offsetY + s.height).toBeLessThanOrEqual(400)
    }
    expect(slices.reduce((n, s) => n + s.height, 0)).toBe(300)
  })

  it('honours the height ceiling within a range', () => {
    const plan = planSlices({
      contentHeight: 10_000,
      viewportHeight: 400,
      from: 1000,
      maxHeight: 900
    })
    expect(plan.slices.reduce((n, s) => n + s.height, 0)).toBe(900)
    expect(plan.truncated).toBe(true)
  })

  it('has nothing to shoot when the range starts at or past the end', () => {
    expect(planSlices({ contentHeight: 1000, viewportHeight: 400, from: 1000 }).slices).toEqual([])
    expect(planSlices({ contentHeight: 1000, viewportHeight: 400, from: 9999 }).slices).toEqual([])
  })

  it('treats a negative start as the top', () => {
    const { slices } = planSlices({ contentHeight: 800, viewportHeight: 400, from: -50 })
    expect(slices[0].scrollTop).toBe(0)
    expect(slices.reduce((n, s) => n + s.height, 0)).toBe(800)
  })
})

// `to` bounds the band without lying about how far the diff runs — the scroll
// clamp is Monaco's, and it is set by the WHOLE content height.
describe('planSlices bounded at both ends', () => {
  it('covers exactly the band between from and to', () => {
    const { slices, truncated } = planSlices({
      contentHeight: 5000,
      viewportHeight: 600,
      from: 1200,
      to: 1500
    })
    expect(truncated).toBe(false)
    expect(slices).toEqual([{ scrollTop: 1200, offsetY: 0, height: 300 }])
  })

  it('still reaches a band at the very end through the scroll clamp', () => {
    const { slices } = planSlices({
      contentHeight: 5000,
      viewportHeight: 600,
      from: 4800,
      to: 5000
    })
    // 5000 - 600 = 4400 is as far as Monaco scrolls; the band sits 400px down it.
    expect(slices).toEqual([{ scrollTop: 4400, offsetY: 400, height: 200 }])
  })

  it('clamps a band that runs past the end of the diff', () => {
    const { slices } = planSlices({
      contentHeight: 1000,
      viewportHeight: 400,
      from: 900,
      to: 99_999
    })
    expect(slices.reduce((n, s) => n + s.height, 0)).toBe(100)
  })

  it('has nothing to shoot for an inverted or empty band', () => {
    expect(
      planSlices({ contentHeight: 1000, viewportHeight: 400, from: 600, to: 400 }).slices
    ).toEqual([])
    expect(
      planSlices({ contentHeight: 1000, viewportHeight: 400, from: 500, to: 500 }).slices
    ).toEqual([])
  })
})
