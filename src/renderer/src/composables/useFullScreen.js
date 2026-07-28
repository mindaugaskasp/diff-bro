import { ref } from 'vue'

// App-window fullscreen state, pushed from main. Module-level singleton so the
// IPC listener is wired once (onFullScreenChange has no removal, so per-instance
// would leak).
const isFullScreen = ref(false)
let wired = false

export function useFullScreen() {
  if (!wired) {
    wired = true
    window.api?.onFullScreenChange?.((value) => {
      isFullScreen.value = !!value
    })
  }
  return isFullScreen
}
