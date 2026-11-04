import { loadPersistedJson, savePersisted } from '../../persist'
import { useSnippetStore } from '../../stores/snippetStore'
import { useVaultStore } from '../../stores/vaultStore'
import { localDay, readTips } from './tipSchedule'
import { readOnboarding, storedOnboarding } from './tourPlan'

const KEY = 'onboarding'

export function readProgress() {
  const library = { diffs: useVaultStore().entries.length, snippets: useSnippetStore().entries }
  const stored = loadPersistedJson(KEY, null)
  const state = readOnboarding(stored, library)
  const fresh = state.offer && !state.current
  const tips = readTips(state.current ? stored.tips : null, {
    since: fresh ? localDay(new Date()) : null
  })
  return { ...state, tips }
}

/** @param {import('../../types').OnboardingState} state */
export function saveProgress(state) {
  savePersisted(KEY, JSON.stringify(storedOnboarding(state)))
}

export const appVersion = () => window.api?.appVersion ?? '0.0.0'
