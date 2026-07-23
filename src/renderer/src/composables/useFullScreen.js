import { ref } from 'vue'

// App-window fullscreen state, pushed from the main process (window.js emits
// `window:fullscreen` on enter/leave-full-screen). Kept as a module-level
// singleton so the IPC listener is wired exactly once, no matter how many
// components read it or how often they mount — preload's onFullScreenChange
// has no removal, so registering per-instance would leak listeners.
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
