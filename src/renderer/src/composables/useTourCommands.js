import { watch } from 'vue'
import { useOnboardingStore } from '../features/onboarding'
import { useCommands } from './useCommands'

// A tour step that must open a dialog before it can point into one names a
// command id. Dispatched here rather than inside the overlay: the overlay is
// exported from its slice's index, so importing the registry there would close
// a cycle back through that index.
export function useTourCommands() {
  const tour = useOnboardingStore()
  const { run } = useCommands()
  watch(
    () => tour.currentStep?.command,
    (id) => id && run(id)
  )
}
