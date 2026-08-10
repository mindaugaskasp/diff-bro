import { computed, onBeforeUnmount, ref } from 'vue'
import { loadPersisted, savePersisted } from '../../persist'

// Its own persisted key, like the sidebar's: settingsStore is at its size cap.
const KEY = 'mergePanes'
// A pane narrower than this cannot show a line of code, so the drag stops there
// rather than letting one collapse to nothing.
const MIN = 0.12

/** A divider moves inside the pair it separates; the third pane keeps its width. */
export const splitAt = (pair, n) => Math.min(Math.max(n, MIN), pair - MIN)

/** Three readable panes out of any two fractions, however they were saved. */
export function normalise(ours, result) {
  const a = Math.min(Math.max(ours, MIN), 1 - 2 * MIN)
  return { ours: a, result: splitAt(1 - a, result) }
}

const track = (n) => `${n.toFixed(4)}fr`

/**
 * The row template. Five tracks, not three: the two grips are grid children as
 * much as the panes are, and a grip left to take a column track of its own
 * wraps the last pane onto a row below.
 */
export const paneColumns = (ours, result) =>
  `${track(ours)} 0 ${track(result)} 0 ${track(1 - ours - result)}`

function read(raw) {
  try {
    const { ours, result } = JSON.parse(raw) ?? {}
    return Number.isFinite(ours) && Number.isFinite(result) ? normalise(ours, result) : null
  } catch {
    return null
  }
}

/**
 * Drag-to-widen for the three panes, as FRACTIONS of the row so the split
 * survives a window resize. Listeners go on the WINDOW, the way
 * useSidebarResize does: the grip is a few pixels wide and the drag moves the
 * edge it sits on, so a listener bound to the grip loses the pointer.
 */
export function useMergePaneSizes() {
  const saved = read(loadPersisted(KEY))
  const ours = ref(saved?.ours ?? 1 / 3)
  const result = ref(saved?.result ?? 1 / 3)
  const resizing = ref(false)
  const columns = computed(() => paneColumns(ours.value, result.value))
  let which = 'ours'
  let startX = 0
  let from = 0
  let pair = 1
  let rowWidth = 1

  function drag(e) {
    const moved = splitAt(pair, from + (e.clientX - startX) / rowWidth)
    if (which === 'ours') {
      ours.value = moved
      result.value = pair - moved
    } else {
      result.value = moved
    }
  }

  // Written on release, not per frame: a drag is one decision and persisting
  // goes through an IPC round trip.
  function end() {
    if (!resizing.value) return
    resizing.value = false
    window.removeEventListener('pointermove', drag)
    window.removeEventListener('pointerup', end)
    savePersisted(KEY, JSON.stringify({ ours: ours.value, result: result.value }))
  }

  function start(edge, e) {
    e.preventDefault?.()
    which = edge
    resizing.value = true
    startX = e.clientX
    from = edge === 'ours' ? ours.value : result.value
    pair = edge === 'ours' ? ours.value + result.value : 1 - ours.value
    rowWidth = e.currentTarget?.parentElement?.clientWidth || window.innerWidth
    window.addEventListener('pointermove', drag)
    window.addEventListener('pointerup', end)
  }

  onBeforeUnmount(end)

  return { columns, resizing, start }
}
