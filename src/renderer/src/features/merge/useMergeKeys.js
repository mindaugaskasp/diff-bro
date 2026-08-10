import { onBeforeUnmount, onMounted } from 'vue'

/**
 * Which way F7 moves. The key every JetBrains user already has in their fingers
 * for next/previous difference, and the reason a merge can be worked through
 * without leaving the keyboard.
 * @returns {number} 0 when the event is not that key
 */
export function stepFromKey(event) {
  if (event.key !== 'F7' || event.ctrlKey || event.metaKey || event.altKey) return 0
  return event.shiftKey ? -1 : 1
}

/**
 * @param {(delta: number) => void} step
 * @returns {() => void} unbind
 */
export function bindMergeKeys(step) {
  const onKey = (event) => {
    const delta = stepFromKey(event)
    if (!delta) return
    event.preventDefault()
    step(delta)
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}

/** @param {(delta: number) => void} step */
export function useMergeKeys(step) {
  let unbind = null
  onMounted(() => (unbind = bindMergeKeys(step)))
  onBeforeUnmount(() => unbind?.())
}
