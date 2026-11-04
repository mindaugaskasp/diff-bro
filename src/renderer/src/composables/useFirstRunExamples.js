import { useSettingsStore } from '../stores/settingsStore'
import { useSnippetStore } from '../stores/snippetStore'

// A profile an older version already seeded never gains the newer examples.
export async function seedFirstRunExamples() {
  const settings = useSettingsStore()
  const snippets = useSnippetStore()
  if (settings.examplesSeeded) return
  // Vault key not ready: retry next launch rather than record them as seeded.
  if (snippets.entries.length === 0 && !(await snippets.seedExamples())) return
  settings.markExamplesSeeded()
}
