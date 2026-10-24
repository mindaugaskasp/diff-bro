import { computed } from 'vue'
import { matchesTags } from '../utils/tagFilter'
import { useVaultStore } from '../stores/vaultStore'

export const OWN_GROUPS = ['favoritesOwn', 'ownActive']
export const RECEIVED_GROUPS = ['importedFavorites', 'importedOthers']

/**
 * The rows one list shows under the sidebar's search, tags and ★ filter, starred first.
 * @param {() => {search: string, tags: string[], favOnly: boolean}} filter
 * @param {string[]} groups the starred vault group, then the rest
 */
export function useDiffRows(filter, [starred, rest]) {
  const vault = useVaultStore()
  const q = computed(() => filter().search.trim().toLowerCase())
  const filtering = computed(() => !!q.value || filter().tags.length > 0)
  const matches = (e) =>
    (!q.value ||
      e.name.toLowerCase().includes(q.value) ||
      e.tags.some((t) => t.includes(q.value))) &&
    matchesTags(e.tags, filter().tags)
  // A row keeps its index in the FULL group, so a drop means the same with a filter on.
  const placed = (group) =>
    vault[group]
      .filter(matches)
      .map((entry) => ({ entry, group, index: vault[group].indexOf(entry) }))
  const rows = computed(() =>
    filter().favOnly ? placed(starred) : [...placed(starred), ...placed(rest)]
  )
  return { rows, filtering }
}
