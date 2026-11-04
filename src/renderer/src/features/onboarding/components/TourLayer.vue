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

const tour = useOnboardingStore()
const settings = useSettingsStore()
const { step, rect, visible } = useTourStep()
const keys = computed(() =>
  step.value?.id === 'save' ? [MOD, 'S'] : acceleratorKeys(settings.quickLookShortcut, isMac)
)
</script>

<template>
  <template v-if="visible">
    <TargetRing :rect="rect" />
    <CoachMark
      :step="step"
      :number="tour.stepNumber"
      :count="tour.stepCount"
      :rect="rect"
      :keys="keys"
      @skip="tour.skip()"
    />
  </template>
  <TourDoneCard v-if="tour.doneCard" @close="tour.dismissDone()" />
</template>
