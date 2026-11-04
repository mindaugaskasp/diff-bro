import { useSettingsStore } from '../../stores/settingsStore'
import { useUiStore } from '../../stores/uiStore'

const SEARCHABLE = ['diffs', 'snippets']

/** Opens what a tip's Show me lights, the way a tour prepares its first step. */
export function prepareTip(prepare) {
  const settings = useSettingsStore()
  if (!prepare) return
  settings.setSidebarCollapsed(false)
  if (prepare === 'snippets') {
    const ui = useUiStore()
    ui.sidebarQuery = ''
    ui.sidebarTags = []
  }
  if (prepare === 'snippets' || !SEARCHABLE.includes(settings.sidebarPanel)) {
    settings.setSidebarPanel('snippets')
  }
}
