import { onBeforeUnmount, ref } from 'vue'
import { loadPersisted, savePersisted } from '../persist'
import { HISTORY_W, clampHistoryWidth, readHistoryWidth } from '../utils/historyWidth'

const KEY = 'historyPanel'

/**
 * Drag-to-widen for the history panel, from its LEFT edge. Listeners go on the
 * window, as in useSidebarResize: the grip moves with the drag.
 * @param {() => number} space  current width of the area the panel shares
 */
export function useHistoryResize(space) {
  const width = ref(readHistoryWidth(loadPersisted(KEY)))
  const resizing = ref(false)
  let from = 0
  let startX = 0

  const save = () => savePersisted(KEY, JSON.stringify({ width: width.value }))
  const drag = (e) => (width.value = clampHistoryWidth(from - (e.clientX - startX), space()))

  function end() {
    if (!resizing.value) return
    resizing.value = false
    window.removeEventListener('pointermove', drag)
    window.removeEventListener('pointerup', end)
    save()
  }

  function start(e) {
    e.preventDefault?.()
    resizing.value = true
    from = width.value
    startX = e.clientX
    window.addEventListener('pointermove', drag)
    window.addEventListener('pointerup', end)
  }

  function reset() {
    width.value = clampHistoryWidth(HISTORY_W, space())
    save()
  }

  onBeforeUnmount(end)
  return { width, resizing, start, end, reset }
}
