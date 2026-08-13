import { computed } from 'vue'
import { toggleTag } from '../utils/tagFilter'
import { useSnippetStore } from '../stores/snippetStore'
import { useUiStore } from '../stores/uiStore'
import { useVaultStore } from '../stores/vaultStore'

// Diffs and snippets are what the sidebar is FOR; an unbounded tag bar pushed
// them into a sliver the moment a library grew past a few dozen tags. What the
// shelf cannot hold at its dragged depth lives behind the picker, which is
// searchable and so is better at fifty tags than the flat wall ever was.
// How deep it is dragged and what fits there belong to useTagShelf.

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

  return {
    active,
    all,
    pick: (name) => (ui.sidebarTags = toggleTag(ui.sidebarTags, name)),
    clear: () => (ui.sidebarTags = [])
  }
}
