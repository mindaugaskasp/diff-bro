import { computed } from 'vue'
import { toggleTag } from '../utils/tagFilter'
import { useSnippetStore } from '../stores/snippetStore'
import { useUiStore } from '../stores/uiStore'
import { useVaultStore } from '../stores/vaultStore'

// The sidebar's tag filter, which the search box's # chip sets (#121).

/** One tag filter across the whole sidebar: the union of diff + snippet tags. */
export function useSidebarTags() {
  const vault = useVaultStore()
  const snippets = useSnippetStore()
  const ui = useUiStore()
  const active = computed(() => ui.sidebarTags)

  const all = computed(() => {
    const counts = {}
    for (const e of vault.entries) for (const t of e.tags || []) counts[t] = (counts[t] || 0) + 1
    for (const e of snippets.entries) for (const t of e.tags || []) counts[t] = (counts[t] || 0) + 1
    return Object.keys(counts)
      .map((name) => ({
        name,
        color: snippets.colorOf(name) || 'var(--text-dim)',
        count: counts[name]
      }))
      .sort((a, b) => b.count - a.count)
  })

  const unique = (entries) => [...new Set(entries.flatMap((e) => e.tags ?? []))]
  return {
    active,
    all,
    /** The tags carried in one list, for the search box's # scope. */
    namesIn: (panel) => unique(panel === 'snippets' ? snippets.entries : vault.entries),
    pick: (name) => (ui.sidebarTags = toggleTag(ui.sidebarTags, name)),
    clear: () => (ui.sidebarTags = [])
  }
}
