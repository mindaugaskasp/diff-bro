import { onBeforeUnmount, ref } from 'vue'

// Two-step confirm: the first press arms, a second within `windowMs` runs it.
// Auto-disarms so a stale armed button can't fire later.
export function useArmedAction(run, windowMs = 3000) {
  const armed = ref(false)
  let timer = null

  function trigger() {
    if (!armed.value) {
      armed.value = true
      timer = setTimeout(() => (armed.value = false), windowMs)
      return
    }
    clearTimeout(timer)
    armed.value = false
    run()
  }

  onBeforeUnmount(() => clearTimeout(timer))
  return { armed, trigger }
}
