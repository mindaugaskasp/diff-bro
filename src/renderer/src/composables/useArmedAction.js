import { onBeforeUnmount, ref } from 'vue'

// Two-step confirm for a destructive button: the first press arms it, a second
// press within `windowMs` runs the action. Disarms itself if the user walks
// away, so a stale armed button can't fire on an accidental later click.
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
