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

const { box, callout, panels, clip, found } = useSpotlight({
  step,
  calloutEl,
  onEscape: () => tour.active && tour.skip()
})

const px = (n) => `${Math.round(n)}px`
const ringStyle = computed(() => ({
  left: px(box.value.x),
  top: px(box.value.y),
  width: px(box.value.w),
  height: px(box.value.h)
}))
const panelStyle = (p) => ({
  left: px(p.left),
  top: px(p.top),
  width: px(p.width),
  height: px(p.height)
})

// An accent ring vanishes on an accent-filled control, so it borrows the ink
// that is already legible on that fill.
const onFilled = computed(() => {
  const el = step.value && document.querySelector(step.value.target)
  return !!el?.classList.contains('btn-primary')
})
</script>

<template>
  <div v-if="tour.active && step && found" class="tour" role="presentation">
    <!-- Blur and tint are separate layers on purpose: Chromium resolves
         backdrop-filter BEFORE clip-path, so a clipped blur layer blurs
         straight through its own hole. -->
    <div v-for="(p, i) in panels" :key="i" class="tour-blur" :style="panelStyle(p)"></div>
    <div class="tour-tint" :style="{ clipPath: clip }"></div>
    <div
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
      :position="callout"
      :box="box"
      :shortcut="shortcut"
      @next="tour.next()"
      @skip="tour.skip()"
    />
  </div>
</template>

<style scoped src="./styles/TourOverlay.css"></style>
