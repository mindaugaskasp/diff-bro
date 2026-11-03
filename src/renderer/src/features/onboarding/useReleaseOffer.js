import { computed, watchEffect } from 'vue'
import { useUiStore } from '../../stores/uiStore'
import { useOnboardingStore } from './onboardingStore'
import { compareVersions, releaseOffer } from './tourPlan'

/** The card after an update: it waits for a quiet moment, then shows once. */
export function useReleaseOffer() {
  const tour = useOnboardingStore()
  const ui = useUiStore()

  watchEffect(() => {
    if (tour.releaseCard) return
    const ids = releaseOffer(tour.pendingReleases, {
      running: tour.isRunning,
      dialogOpen: ui.hasOpenDialog,
      doneCard: !!tour.doneCard
    })
    if (ids.length) tour.presentReleases(ids)
  })

  const cardTours = computed(() => (tour.releaseCard ?? []).map(tour.tourOf).filter(Boolean))
  return {
    cardTours,
    single: computed(() => (cardTours.value.length === 1 ? cardTours.value[0] : null)),
    version: computed(
      () =>
        cardTours.value
          .map((t) => t.introducedIn)
          .sort(compareVersions)
          .at(-1) ?? ''
    ),
    visible: computed(() => cardTours.value.length > 0 && !tour.isRunning && !ui.hasOpenDialog)
  }
}
