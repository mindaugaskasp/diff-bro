import { onBeforeUnmount, ref } from 'vue'
import { loadPersisted, savePersisted } from '../persist'
import { clampSidebarWidth, readSidebarWidth } from '../utils/sidebarWidth'

// Its own persisted key rather than a corner of settingsStore, which is at its
// size cap — the same reason the onboarding slice keeps its own.
const KEY = 'sidebar'

/**
 * Drag-to-widen for the sidebar. The move/up listeners go on the WINDOW, the
 * way useDialogResize does: the grip is 4px wide and pinned to an edge that the
 * drag itself moves, so anything bound to the grip loses the pointer mid-drag
 * and stops short of where it was let go.
 */
export function useSidebarResize() {
  const width = ref(readSidebarWidth(loadPersisted(KEY)))
  const resizing = ref(false)
  let from = 0
  let startX = 0

  const drag = (e) => (width.value = clampSidebarWidth(from + (e.clientX - startX)))

  // Written on release, not per frame: a drag is one decision, and persist()
  // goes through an IPC round trip.
  function end() {
    if (!resizing.value) return
    resizing.value = false
    window.removeEventListener('pointermove', drag)
    window.removeEventListener('pointerup', end)
    savePersisted(KEY, JSON.stringify({ width: width.value }))
  }

  function start(e) {
    // The grip overlays the rows, and a row is draggable: without this the
    // native drag's pointercancel kills the resize two moves in.
    e.preventDefault?.()
    resizing.value = true
    from = width.value
    startX = e.clientX
    window.addEventListener('pointermove', drag)
    window.addEventListener('pointerup', end)
  }

  onBeforeUnmount(end)
  return { width, resizing, start, drag, end }
}
