import { onBeforeUnmount, ref } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { MAX_TAG_ROWS, MIN_TAG_ROWS, clampNumber } from '../utils/settingsDefaults'

const SHELF_GAP_PX = 4
const FALLBACK_ROW_PX = 26

/**
 * Drag-to-deepen for the sidebar tag shelf — the depth's ONLY affordance; it
 * persists through the tagShelfRows setting invisibly. Quantised to whole rows
 * because the limit counts chips, not pixels. Writes happen only when the
 * quantised row count moves — a handful per drag, not per frame. Listeners go
 * on the WINDOW, the way useSidebarResize's do: the grip is 4px tall and the
 * drag itself moves it out from under the pointer.
 * @param {import('vue').Ref<HTMLElement|null>} shelf  the chip row, measured for the step
 */
export function useTagShelfResize(shelf) {
  const settings = useSettingsStore()
  const resizing = ref(false)
  let fromRows = 0
  let startY = 0
  let step = FALLBACK_ROW_PX

  const rowsAt = (clientY) =>
    clampNumber(
      fromRows + Math.round((clientY - startY) / step),
      fromRows,
      MIN_TAG_ROWS,
      MAX_TAG_ROWS
    )

  function drag(e) {
    const rows = rowsAt(e.clientY)
    if (rows !== settings.tagShelfRows) settings.setLimit('tagShelfRows', rows)
  }

  function end() {
    if (!resizing.value) return
    resizing.value = false
    window.removeEventListener('pointermove', drag)
    window.removeEventListener('pointerup', end)
  }

  function start(e) {
    e.preventDefault?.()
    resizing.value = true
    fromRows = clampNumber(settings.tagShelfRows, MIN_TAG_ROWS, MIN_TAG_ROWS, MAX_TAG_ROWS)
    startY = e.clientY
    const chip = shelf?.value?.querySelector('.usb-tag')
    step = chip ? chip.offsetHeight + SHELF_GAP_PX : FALLBACK_ROW_PX
    window.addEventListener('pointermove', drag)
    window.addEventListener('pointerup', end)
  }

  onBeforeUnmount(end)
  return { resizing, start }
}
