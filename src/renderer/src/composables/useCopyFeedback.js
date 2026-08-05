import { onScopeDispose, ref } from 'vue'

// Transient "Copied" acknowledgement shown at the click. `flash()` flips
// `copied` true on a successful copy and clears it after `duration` ms; a
// repeat click restarts the timer rather than stacking. The timer logic lives
// here (not inline in the row) so it stays unit-testable — the recurring class
// of "does the flash appear/clear correctly" bug is caught in a test, not by eye.
export function useCopyFeedback(duration = 1200) {
  const copied = ref(false)
  let timer = null

  function clear() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }
  // `mark` lets a panel with several copy buttons record WHICH one was pressed
  // (the value, the algorithm) instead of a bare boolean, so only that row shows
  // the tick. It always clears back to false, which compares false against any
  // such marker.
  function flash(mark = true) {
    copied.value = mark
    clear()
    timer = setTimeout(() => {
      copied.value = false
      timer = null
    }, duration)
  }
  function cancel() {
    clear()
    copied.value = false
  }

  // A row can unmount mid-flash (filter change, delete); don't leave a timer
  // writing to a discarded ref.
  onScopeDispose(clear)

  return { copied, flash, cancel }
}
