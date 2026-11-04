import { useSettingsStore } from '../../stores/settingsStore'
import { useUiStore } from '../../stores/uiStore'
import { ensureDiagramExamples } from './tourExamples'

/**
 * The Snippets panel in view with nothing filtering it, so the rows a step
 * rings are there.
 * @param {string} id
 * @returns {Promise<{ examples?: { example: string, v2: string } }|null>}
 */
export async function prepareTour(id) {
  const ui = useUiStore()
  const settings = useSettingsStore()
  ui.showSettingsDialog = false
  ui.sidebarQuery = ''
  ui.sidebarTags = []
  settings.setSidebarCollapsed(false)
  settings.setSidebarPanel('snippets')
  if (id !== 'diagrams') return {}
  const examples = await ensureDiagramExamples()
  return examples ? { examples } : null
}
