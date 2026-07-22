import { computed, ref } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'

// Sentinel for the untagged filter — never a real tag (those are lowercased).
export const DEFAULT_TAG = '__DEFAULT__'

// Text search and tag selection for the snippets sidebar. The two COMPOSE (AND)
// — neither resets the other — which is the whole reason this lives in one
// place instead of being re-derived per shelf.
export function useSnippetFilters() {
  const store = useSnippetStore()
  const query = ref('')
  const activeTags = ref(new Set())

  const filtering = computed(() => activeTags.value.size > 0 || query.value.trim().length > 0)

  function toggleTag(name) {
    const next = new Set(activeTags.value)
    next.has(name) ? next.delete(name) : next.add(name)
    activeTags.value = next
    if (name !== DEFAULT_TAG && next.has(name)) store.touchTag(name) // used → recent
  }
  function clearFilters() {
    activeTags.value = new Set()
    query.value = ''
  }

  function matches(entry) {
    const q = query.value.trim().toLowerCase()
    const byText =
      !q ||
      entry.name.toLowerCase().includes(q) ||
      entry.tags.some((t) => t.includes(q)) ||
      (!entry.tags.length && 'default'.includes(q))
    const has = (t) => (t === DEFAULT_TAG ? entry.tags.length === 0 : entry.tags.includes(t))
    const byTags = activeTags.value.size === 0 || [...activeTags.value].every(has)
    return byText && byTags
  }

  const visibleFavorites = computed(() => store.favorites.filter(matches))
  const visibleListed = computed(() => store.listed.filter(matches))
  const anyVisible = computed(() => visibleFavorites.value.length || visibleListed.value.length)

  // Filter bar chips: the Default catch-all first, then tags newest/just-used first.
  const tagChips = computed(() => [
    { name: DEFAULT_TAG, label: 'Default', color: null, count: store.defaultCount },
    ...store.tagList.map((t) => ({ name: t.name, label: t.name, color: t.color, count: t.count }))
  ])

  return {
    query,
    activeTags,
    filtering,
    toggleTag,
    clearFilters,
    visibleFavorites,
    visibleListed,
    anyVisible,
    tagChips
  }
}
