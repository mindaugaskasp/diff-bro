import { computed } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'

/**
 * The tag word a sidebar row shows beside its name — and whether it shows one at
 * all. Off (Settings ▸ Appearance) hides the WORD and nothing else: the shelf
 * still filters and the search still finds by tag, which is what lets a row this
 * narrow give the space back to the name.
 *
 * Shared by both row kinds so the two cannot disagree about what "off" means.
 * @param {() => string[]} tags  the row's own tags, already filtered
 * @returns {{ shown: import('vue').ComputedRef<string[]>, showing: import('vue').ComputedRef<boolean> }}
 */
export function useRowTags(tags) {
  const settings = useSettingsStore()
  const showing = computed(() => settings.showRowTags)
  return { showing, shown: computed(() => (showing.value ? tags() : [])) }
}
