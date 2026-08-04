<script setup>
import { computed, ref } from 'vue'
import { useOnboardingStore } from '../onboardingStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useSpotlight } from '../../../composables/useSpotlight'
import { acceleratorLabel } from '../../../utils/accelerator'
import { isMac } from '../../../keys'
import TourCallout from './TourCallout.vue'

// Mounted always; only its contents are conditional. Starting the tour and
// dispatching a step's command both live in composables/useTourCommands.js —
// reaching the registry from in here would close a cycle back through this
// slice's own index.
const tour = useOnboardingStore()
const settings = useSettingsStore()
const calloutEl = ref(null)

const step = computed(() => tour.currentStep)

const shortcut = computed(() => acceleratorLabel(settings.quickLookShortcut, isMac))

const spot = useSpotlight({
  step,
  calloutEl,
  onEscape: () => tour.active && tour.skip()
})

const px = (n) => `${Math.round(n)}px`
const boxStyle = (b) => ({ left: px(b.x), top: px(b.y), width: px(b.w), height: px(b.h) })
const ringStyle = computed(() => boxStyle(spot.value.ring))
const holeStyle = computed(() => boxStyle(spot.value.hole))
const panelStyle = (p) => ({
  left: px(p.left),
  top: px(p.top),
  width: px(p.width),
  height: px(p.height)
})

// An accent ring vanishes on an accent-filled control, so it borrows the ink
// that is already legible on that fill.
const onFilled = computed(() => {
  const el = step.value && document.querySelector(step.value.point ?? step.value.target)
  return !!el?.classList.contains('btn-primary')
})
</script>

<template>
  <div
    v-if="tour.active && !tour.revealing && step"
    class="tour"
    :class="{ soft: spot.soft }"
    role="presentation"
  >
    <!-- Blur and tint are separate layers on purpose: Chromium resolves
         backdrop-filter BEFORE clip-path, so a clipped blur layer blurs
         straight through its own hole. -->
    <div v-for="(p, i) in spot.panels" :key="i" class="tour-blur" :style="panelStyle(p)"></div>
    <div class="tour-tint" :style="{ clipPath: spot.clip }"></div>
    <div v-if="!step.live && spot.found" class="tour-block" :style="holeStyle"></div>
    <div
      v-if="spot.context"
      class="tour-context"
      :style="boxStyle(spot.context)"
      aria-hidden="true"
    ></div>
    <!-- No ring when the step's control is not on screen: the card still
         explains itself, and Next and Skip stay reachable. -->
    <div
      v-if="spot.found"
      class="tour-ring"
      :class="{ zone: step.zone, filled: onFilled }"
      :style="ringStyle"
      aria-hidden="true"
    ></div>
    <TourCallout
      ref="calloutEl"
      :step="step"
      :index="tour.index"
      :count="tour.stepCount"
      :position="spot.callout"
      :box="spot.ring"
      :shortcut="shortcut"
      :anchored="spot.found"
      @next="tour.next()"
      @back="tour.back()"
      @skip="tour.skip()"
    />
  </div>
</template>

<style scoped src="./styles/TourOverlay.css"></style>
