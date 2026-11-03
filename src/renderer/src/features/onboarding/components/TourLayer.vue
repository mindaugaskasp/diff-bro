<script setup>
import { computed } from 'vue'
import { useOnboardingStore } from '../onboardingStore'
import { useTourStep } from '../useTourStep'
import { useSettingsStore } from '../../../stores/settingsStore'
import { acceleratorKeys } from '../../../utils/accelerator'
import { MOD, isMac } from '../../../keys'
import CoachMark from './CoachMark.vue'
import TargetRing from './TargetRing.vue'
import TourDoneCard from './TourDoneCard.vue'
import ReleaseTourCard from './ReleaseTourCard.vue'

const tour = useOnboardingStore()
const settings = useSettingsStore()
const { step, rect, rings, visible } = useTourStep()
const keys = computed(() =>
  step.value?.id === 'save' ? [MOD, 'S'] : acceleratorKeys(settings.quickLookShortcut, isMac)
)
</script>

<template>
  <template v-if="visible">
    <TargetRing v-for="(ring, i) in rings" :key="i" :rect="ring.rect" :zone="ring.zone" />
    <CoachMark
      :step="step"
      :label-key="tour.labelKey"
      :number="tour.stepNumber"
      :count="tour.stepCount"
      :rect="rect"
      :keys="keys"
      @skip="tour.skip()"
      @action="tour.fillSample()"
    />
  </template>
  <TourDoneCard
    v-if="tour.doneCard"
    :tour-id="tour.doneCard"
    @close="tour.dismissDone()"
    @start="tour.startTour($event)"
  />
  <ReleaseTourCard />
</template>
