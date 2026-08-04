import { watch } from 'vue'
import { useOnboardingStore } from '../features/onboarding'
import { useTabsStore } from '../stores/tabsStore'
import { useCommands } from './useCommands'

// Starts the tour, and dispatches the command a step names when it must open a
// dialog before it can point into one. Both live here rather than in the
// overlay: the overlay is exported from its slice's index, so importing the
// registry there would close a cycle back through that index.
export function useTourCommands() {
  const tour = useOnboardingStore()
  const tabs = useTabsStore()
  const { run } = useCommands()

  // Only once the restored session is in place. Starting on mount raced it:
  // step one loaded its demo comparison and restoreSession then wrote the
  // stored (empty) session straight over the top.
  watch(
    () => tabs.sessionReady,
    (ready) => ready && tour.begin(),
    { immediate: true }
  )
  watch(
    () => tour.currentStep?.command,
    (id) => id && run(id)
  )
}
