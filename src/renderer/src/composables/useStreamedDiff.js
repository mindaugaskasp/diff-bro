import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { buildRowPlan, lineSpanOf, rowsIn } from '../utils/streamRows'
import { useVirtualRows } from './useVirtualRows'
import { STREAM_ROW_H } from '../utils/virtualRows'
import { zoomedPx } from '../utils/diffZoom'
import { useUiStore } from '../stores/uiStore'

// The row height and the window that measures it, together — they are one fact.
// Zoomed like every other comparison, and the virtualization computes its
// spacers from this number, so a row drawn at any other height makes them lie.
function streamRows(elementRef, total) {
  const ui = useUiStore()
  const rowHeight = computed(() => zoomedPx(STREAM_ROW_H, ui.diffZoom))
  return { rowHeight, rowView: useVirtualRows(elementRef, total, rowHeight) }
}

// Lines held per side. Well past any viewport, so scrolling back a page is
// instant; cleared wholesale when it fills, because an exact LRU would cost
// more bookkeeping than re-reading a window is worth.
const MAX_CACHED_LINES = 20_000
// Mirrors MAX_WINDOW_ROWS in src/main/streamWindow.js, which REFUSES a wider
// request rather than clamping it. Keep the two in step.
const MAX_REQUEST_ROWS = 400

/**
 * The streamed comparison: open a session in main, hold the alignment, and keep
 * the visible rows' text fetched.
 *
 * @param {import('vue').Ref<HTMLElement|null>} elementRef  the scrolling box
 */
export function useStreamedDiff(elementRef) {
  const store = useDiffStore()
  const plan = shallowRef(buildRowPlan([]))
  const summary = ref(null)
  const error = ref(null)
  const loading = ref(true)
  const token = ref(null)
  const cache = { left: reactive(new Map()), right: reactive(new Map()) }

  const total = computed(() => plan.value.total)
  const { rowHeight, rowView } = streamRows(elementRef, total)
  // Bumped per open, so a slow index for a comparison the user has already
  // moved on from cannot land and repaint with the wrong file's rows.
  let generation = 0

  function closeSession() {
    if (token.value) window.api.streamClose(token.value)
    token.value = null
  }

  function reset() {
    cache.left.clear()
    cache.right.clear()
    plan.value = buildRowPlan([])
    summary.value = null
  }

  async function fetchSpan(side, span) {
    const map = cache[side]
    for (let from = span.from; from < span.to; from += MAX_REQUEST_ROWS) {
      const to = Math.min(span.to, from + MAX_REQUEST_ROWS)
      let missing = false
      for (let line = from; line < to && !missing; line++) missing = !map.has(line)
      if (!missing) continue
      const res = await window.api.streamLines({ token: token.value, side, from, to })
      if (res?.error || !res?.lines) continue
      if (map.size > MAX_CACHED_LINES) map.clear()
      res.lines.forEach((line, k) => map.set(from + k, line))
    }
  }

  async function fillWindow() {
    if (!token.value) return
    const visible = rowsIn(plan.value, rowView.value.start, rowView.value.end)
    for (const side of ['left', 'right']) {
      const span = lineSpanOf(visible, side)
      if (span) await fetchSpan(side, span)
    }
    // The only honest signal that the rows on screen now hold their text — the
    // image export scrolls this viewer and must not shoot between the two.
    store.diffRevision++
  }

  async function open() {
    // The loaded FILES, not the comparables: a comparison goes streamed as soon
    // as ONE side is too large, and the other side's comparable is an ordinary
    // text one that carries no path.
    const leftPath = store.left?.path
    const rightPath = store.right?.path
    const mine = ++generation
    closeSession()
    reset()
    error.value = null
    loading.value = false
    if (!leftPath || !rightPath) return
    loading.value = true
    const res = await window.api.streamOpen(leftPath, rightPath)
    if (mine !== generation) return
    loading.value = false
    if (!res || res.error) {
      error.value = res?.error ?? 'unreadable'
      return
    }
    token.value = res.token
    plan.value = buildRowPlan(res.runs)
    summary.value = res
    // The toolbar's +/− counts come from the diff editor for a normal
    // comparison; nothing else would ever set them here.
    store.stats = { additions: res.additions, deletions: res.deletions }
    await fillWindow()
  }

  const rows = computed(() =>
    rowsIn(plan.value, rowView.value.start, rowView.value.end).map((row) => ({
      ...row,
      leftText: row.leftLine === null ? null : (cache.left.get(row.leftLine) ?? ''),
      rightText: row.rightLine === null ? null : (cache.right.get(row.rightLine) ?? '')
    }))
  )

  watch(rowView, fillWindow)
  watch(() => [store.left?.path, store.right?.path], open, { immediate: true })

  onBeforeUnmount(closeSession)

  // useVirtualRows attaches its own scroll listener, so the viewer no longer
  // needs an onScroll of its own — it just reads the window.
  return { window: rowView, rowHeight, rows, total, summary, error, loading }
}
