import { ref, watch } from 'vue'
import { isWindows } from '../keys'
import { useUiStore } from '../stores/uiStore'
import { navAfterGroupClick, navForPage, settingsGroups } from '../utils/settingsNav'

export function useSettingsNav() {
  const ui = useUiStore()
  const groups = settingsGroups({ windows: isWindows })
  /** @type {import('vue').Ref<import('../types').SettingsNavState>} */
  const nav = ref(navForPage(groups, ui.settingsTab))
  // The dialog stays mounted while open, so a page asked for from an open Settings must still land.
  watch(
    () => ui.settingsTab,
    (id) => {
      if (id) nav.value = navForPage(groups, id)
    }
  )
  return {
    groups,
    nav,
    showPage: (id) => (nav.value = navForPage(groups, id)),
    toggleGroup: (id) => (nav.value = navAfterGroupClick(groups, nav.value, id))
  }
}
