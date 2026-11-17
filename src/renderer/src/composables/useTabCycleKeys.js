import { onBeforeUnmount, onMounted } from 'vue'

/** @param {KeyboardEvent} e @returns {'tab-next'|'tab-prev'|null} */
export function tabCycleAction(e) {
  if (e.key !== 'Tab' || !e.ctrlKey || e.metaKey || e.altKey) return null
  return e.shiftKey ? 'tab-prev' : 'tab-next'
}

// Ctrl+Tab lost its menu entry (#263), and with it the accelerator that carried it.
export function useTabCycleKeys(run) {
  const onKey = (e) => {
    const action = tabCycleAction(e)
    if (!action) return
    e.preventDefault()
    e.stopPropagation()
    run(action)
  }
  onMounted(() => window.addEventListener('keydown', onKey, true))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
}
