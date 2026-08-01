// Where a diff screenshot is taken from, and when. Main photographs the page
// itself (src/main/diffImage.js), so the renderer's whole job is to name the
// region and to wait until Monaco has actually painted the new content —
// capturing a frame too early photographs the previous diff, which is the one
// failure mode a screenshot feature cannot have.

// The comparison column: the file-slots row, the format banner and the viewer.
// The toolbar, the sidebar and any dialog are deliberately outside it.
export const CAPTURE_SELECTOR = '.content'
// Monaco's host inside that column. The strip above it (file slots, format
// banner) belongs in the picture once, at the top — never repeated per slice.
export const EDITOR_SELECTOR = '.diff-container'
// Monaco renders one of these per visible line, in both panes.
const LINE_SELECTOR = '.view-line'
// Breathing room under the last line, and a floor so a one-line diff still
// produces a picture rather than a sliver.
const BOTTOM_PAD = 14
const MIN_HEIGHT = 160

// The bottom of the lowest rendered line, in viewport coordinates. Monaco's
// pane is as tall as the panel whatever the diff, so without this a six-line
// change is exported as a mostly-empty page.
function lastLineBottom(root) {
  let bottom = 0
  for (const line of root.querySelectorAll(LINE_SELECTOR)) {
    const r = line.getBoundingClientRect()
    if (r.height && r.bottom > bottom) bottom = r.bottom
  }
  return bottom
}

/**
 * The capture region in CSS pixels, cropped to the content that is actually
 * rendered, or null when there is nothing on screen to shoot.
 * @param {Document} [doc]
 * @returns {import('../types').CaptureRect | null}
 */
export function captureRectOf(doc = document) {
  const el = doc.querySelector(CAPTURE_SELECTOR)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (!r.width || !r.height) return null
  const bottom = lastLineBottom(el)
  // A diff taller than the pane keeps the full height; anything shorter is
  // cropped just below its last line.
  const used = bottom ? Math.min(r.height, bottom - r.top + BOTTOM_PAD) : r.height
  return {
    x: Math.round(r.left),
    y: Math.round(r.top),
    width: Math.round(r.width),
    height: Math.round(Math.max(MIN_HEIGHT, used))
  }
}

/**
 * Resolve once the browser has painted `frames` more times. Monaco lays out on
 * a ResizeObserver and tokenizes asynchronously, so a freshly restored diff
 * needs a few frames before it is on screen.
 * @param {number} [frames]
 * @param {Window} [win]
 * @returns {Promise<void>}
 */
export function afterFrames(frames = 3, win = window) {
  return new Promise((resolve) => {
    let left = Math.max(1, frames)
    const step = () => {
      left -= 1
      if (left <= 0) resolve()
      else win.requestAnimationFrame(step)
    }
    win.requestAnimationFrame(step)
  })
}

/**
 * The column and, within it, the scrolling viewport — the two boxes a stitched
 * export is cut from. The strip above the viewport (file slots, format banner,
 * sheet tabs) belongs in the picture once, at the top.
 *
 * The viewport is whatever the registered scroller says it is, so this works
 * for Monaco, the spreadsheet grids and the structure list alike; the selector
 * is only the fallback for a scroller that predates the field.
 * @param {{ viewport?: Element|null, doc?: Document }} [opts]
 * @returns {{ content: import('../types').CaptureRect, editorY: number } | null}
 */
export function captureRegionOf({ viewport = null, doc = document } = {}) {
  const el = doc.querySelector(CAPTURE_SELECTOR)
  const column = rectOf(el)
  if (!column?.width) return null
  const pane = rectOf(viewport ?? el.querySelector?.(EDITOR_SELECTOR))
  return pane ? { content: boxOf(column), editorY: Math.round(pane.top) } : null
}

// A box that is actually on screen, or null — an unmounted or collapsed one has
// nothing to photograph.
const rectOf = (node) => {
  const r = node?.getBoundingClientRect?.()
  return r?.height ? r : null
}

const boxOf = (r) => ({
  x: Math.round(r.left),
  y: Math.round(r.top),
  width: Math.round(r.width),
  height: Math.round(r.height)
})

/**
 * @typedef {object} CaptureSlice
 * @property {number} scrollTop  where to scroll the editor before the shot
 * @property {number} offsetY    pixels from the viewport's top to start keeping
 * @property {number} height     pixels to keep
 */

/**
 * Split a diff taller than its pane into back-to-back viewport shots, to be
 * stitched into one tall picture. capturePage only ever photographs what is
 * composited, and Monaco keeps no offscreen lines in the DOM, so a single shot
 * can never exceed the pane — scrolling is the only way to see the rest.
 * `from`/`to` bound the picture to part of the diff — how a selected line range
 * is exported. They are content pixels, not lines, so this stays free of Monaco.
 * `contentHeight` stays the WHOLE diff either way: it is what Monaco clamps
 * scrolling to, and a band near the end is reached only by that clamp.
 * @param {{ contentHeight: number, viewportHeight: number, maxHeight?: number,
 *          from?: number, to?: number }} opts
 * @returns {{ slices: CaptureSlice[], truncated: boolean }}
 */
export function planSlices({ contentHeight, viewportHeight, maxHeight = Infinity, from = 0, to }) {
  if (!(contentHeight > 0) || !(viewportHeight > 0)) return { slices: [], truncated: false }
  const start = Math.min(Math.max(from, 0), contentHeight)
  const end = Math.min(Math.max(to ?? contentHeight, start), contentHeight)
  const available = end - start
  if (!(available > 0)) return { slices: [], truncated: false }
  const total = Math.min(available, maxHeight)
  const maxScroll = Math.max(0, contentHeight - viewportHeight)
  const slices = []
  for (let covered = 0; covered < total;) {
    const height = Math.min(viewportHeight, total - covered)
    const scrollTop = Math.min(start + covered, maxScroll)
    slices.push({ scrollTop, offsetY: start + covered - scrollTop, height })
    covered += height
  }
  return { slices, truncated: available > total }
}

/**
 * Poll `read` each frame until its value differs from what it was at the call,
 * giving up after `frames`. Monaco computes a diff in a WORKER and paints its
 * add/remove decorations only once that returns, so no fixed number of frames
 * is safe: shooting early photographs the files with no highlights, which reads
 * as "there are no differences".
 * @param {() => unknown} read
 * @param {{ frames?: number, win?: Window }} [opts]
 * @returns {Promise<boolean>} true if it changed, false if the budget ran out
 */
export function untilChanged(read, { frames = 240, win = window } = {}) {
  const before = read()
  return new Promise((resolve) => {
    let left = Math.max(1, frames)
    const step = () => {
      if (read() !== before) return resolve(true)
      left -= 1
      if (left <= 0) return resolve(false)
      win.requestAnimationFrame(step)
    }
    win.requestAnimationFrame(step)
  })
}
