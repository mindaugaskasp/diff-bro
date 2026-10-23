import { getCurrentInstance, onBeforeUnmount, ref } from 'vue'

/**
 * Open while hovered or focused, with a short grace so the pointer can travel
 * from the trigger into the popover. Escape closes it at once.
 * @param {{ closeMs?: number }} [opts]
 */
export function useHoverReveal({ closeMs = 120 } = {}) {
  const open = ref(false)
  let timer = null
  const cancel = () => clearTimeout(timer)

  // Hover moves no focus, so Escape is heard on the window while open.
  const onWindowKey = (e) => e.key === 'Escape' && close()
  function close() {
    cancel()
    open.value = false
    window.removeEventListener('keydown', onWindowKey, true)
  }
  function enter() {
    cancel()
    if (!open.value) window.addEventListener('keydown', onWindowKey, true)
    open.value = true
  }
  function leave() {
    cancel()
    timer = setTimeout(close, closeMs)
  }
  function onKeydown(e) {
    if (e.key !== 'Escape' || !open.value) return
    e.stopPropagation?.()
    close()
  }

  if (getCurrentInstance()) onBeforeUnmount(close)
  return { open, enter, leave, onKeydown }
}
