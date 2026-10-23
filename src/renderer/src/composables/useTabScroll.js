import { watch } from 'vue'
import { useTabsStore } from '../stores/tabsStore'

// A tab switch rebuilds the editor, so the place is restored once the diff lays out.
export function useTabScroll() {
  const tabs = useTabsStore()
  let pending = 0
  watch(
    () => tabs.activeId,
    () => (pending = tabs.active?.scrollTop ?? 0),
    { immediate: true }
  )
  return (pane) => {
    if (!pending) return
    pane.setScrollTop(pending)
    pending = 0
  }
}
