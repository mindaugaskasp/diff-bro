import { watch } from 'vue'
import { useOnboardingStore } from '../features/onboarding'
import { useSettingsStore } from '../stores/settingsStore'
import { useTabsStore } from '../stores/tabsStore'
import { useCommands } from './useCommands'

// Starts the tour, and runs the commands its steps ask for. Both live here
// rather than in the overlay or the store: either would import the registry and
// close a cycle back through the slice's own index.
export function useTourCommands() {
  const tour = useOnboardingStore()
  const tabs = useTabsStore()
  const settings = useSettingsStore()
  const { run } = useCommands()

  // Only once the restored session is in place. Starting on mount raced it:
  // step one loaded its demo comparison and restoreSession then wrote the
  // stored (empty) session straight over the top. With reopening switched off
  // there is no session to wait for, and `sessionReady` never turns true —
  // waiting on it alone kept the tour from ever running.
  watch(
    () => tabs.sessionReady || !settings.restoreSession,
    (settled) => settled && tour.begin(),
    { immediate: true }
  )
  // Synchronous, so whatever a step's Next opens is already on screen by the
  // time the step after it is measured.
  watch(
    () => tour.pendingCommand,
    (pending) => pending && run(pending.action),
    { flush: 'sync' }
  )
}
