import { onBeforeUnmount, onMounted } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useSettingsStore } from '../stores/settingsStore'

// Refocus re-reads the compared files and rolls the daily theme over.
export function useWindowFocusRefresh() {
  const store = useDiffStore()
  const settings = useSettingsStore()
  const onFocus = () => {
    store.refreshFromDisk()
    settings.resolveActiveTheme()
  }
  onMounted(() => window.addEventListener('focus', onFocus))
  onBeforeUnmount(() => window.removeEventListener('focus', onFocus))
}
