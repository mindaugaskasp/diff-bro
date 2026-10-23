import { computed, watch } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import { useTabsStore } from '../stores/tabsStore'
import { isSnippetTab } from '../utils/tabs'

// Openers still ask through snippetStore.editingSnippet; this turns it into a tab.
export function useSnippetTabs() {
  const snippets = useSnippetStore()
  const tabs = useTabsStore()
  watch(
    () => snippets.editingSnippet,
    (editing) => {
      if (!editing) return
      const name = snippets.entries.find((e) => e.id === editing.id)?.name ?? ''
      tabs.openSnippet({ ...editing }, name)
      snippets.editingSnippet = null
    },
    { immediate: true }
  )
  return {
    activeSnippetTab: computed(() => (isSnippetTab(tabs.active) ? tabs.active : null)),
    // Mounted per open tab: switching away keeps the draft, closing unmounts it.
    snippetTabs: computed(() => tabs.tabs.filter(isSnippetTab))
  }
}
