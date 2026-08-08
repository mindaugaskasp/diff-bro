import { computed } from 'vue'
import { toggleTag } from '../utils/tagFilter'
import { useSnippetStore } from '../stores/snippetStore'
import { useUiStore } from '../stores/uiStore'
import { useVaultStore } from '../stores/vaultStore'
import { useSettingsStore } from '../stores/settingsStore'
import { MAX_TAG_ROWS, MIN_TAG_ROWS, TAGS_PER_ROW, clampNumber } from '../utils/settingsDefaults'

// Diffs and snippets are what the sidebar is FOR; an unbounded tag bar pushed
// them into a sliver the moment a library grew past a few dozen tags. The rest
// live behind the picker, which is searchable and so is better at fifty tags
// than the flat wall ever was.
//
// A tall screen has room the default two rows do not use, so the depth is a
// setting (MIN_TAG_ROWS is the floor as well as the default).

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

  // Selected tags come first whatever their count: a filter you cannot see is
  // worse than one you cannot reach, and rank alone would hide your own choice
  // behind "+42 more".
  const limit = computed(
    () =>
      TAGS_PER_ROW *
      clampNumber(useSettingsStore().tagShelfRows, MIN_TAG_ROWS, MIN_TAG_ROWS, MAX_TAG_ROWS)
  )
  const bar = computed(() => {
    const chosen = all.value.filter((t) => active.value.includes(t.name))
    const rest = all.value.filter((t) => !active.value.includes(t.name))
    return [...chosen, ...rest].slice(0, Math.max(limit.value, chosen.length))
  })

  return {
    active,
    all,
    bar,
    overflow: computed(() => all.value.length - bar.value.length),
    pick: (name) => (ui.sidebarTags = toggleTag(ui.sidebarTags, name)),
    clear: () => (ui.sidebarTags = [])
  }
}
