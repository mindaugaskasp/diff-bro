import { ref } from 'vue'

// Where saved diffs and snippets actually live on disk (Settings → Data folder).
// Module-level: the path doesn't change while the app runs, so one IPC call
// serves every component that wants to mention it.
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
