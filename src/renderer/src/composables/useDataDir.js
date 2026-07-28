import { ref } from 'vue'

// The on-disk data folder. Module-level: one IPC call serves every component
// (the path can't change while running).
const dataDir = ref('')
let requested = false

export function useDataDir() {
  if (!requested) {
    requested = true
    window.api.dataDirGet?.().then((res) => {
      if (res?.dir) dataDir.value = res.dir
    })
  }
  return dataDir
}
