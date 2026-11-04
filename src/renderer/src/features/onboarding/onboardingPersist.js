import { loadPersistedJson, savePersisted } from '../../persist'
import { useSnippetStore } from '../../stores/snippetStore'
import { useVaultStore } from '../../stores/vaultStore'
import { readOnboarding, storedOnboarding } from './tourPlan'

const KEY = 'onboarding'

export function readProgress() {
  const library = { diffs: useVaultStore().entries.length, snippets: useSnippetStore().entries }
  return readOnboarding(loadPersistedJson(KEY, null), library)
}

/** @param {{ showTips: boolean, tours: Record<string, string>, offer: boolean }} state */
export function saveProgress(state) {
  savePersisted(KEY, JSON.stringify(storedOnboarding(state)))
}
