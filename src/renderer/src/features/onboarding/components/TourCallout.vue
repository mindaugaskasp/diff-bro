<script setup>
// The card beside the spotlit control. Its face is --bg-elevated and its
// keyline --btn-edge: against a scrimmed ground those two swap roles by theme —
// the face separates it on the seven light grounds (up to 3.23:1), the keyline
// on the seven dark ones (up to 18.4:1). A --bg-raised card with a plain
// --border keyline measured under floor on 11 of the 14.
import { computed, ref } from 'vue'
import { shaped } from '../../../utils/props'
import { CALLOUT_W } from '../../../utils/spotlight'

const props = defineProps({
  step: { type: Object, required: true, validator: shaped('id', 'target', 'body') },
  index: { type: Number, required: true },
  count: { type: Number, required: true },
  position: { type: Object, required: true, validator: shaped('x', 'y') },
  box: { type: Object, required: true, validator: shaped('x', 'y', 'w', 'h') },
  shortcut: { type: String, default: '' }
})
defineEmits(['next', 'skip'])

const BEAK = 9
const EDGE = 14
const isLast = computed(() => props.index === props.count - 1)
const calloutH = computed(() => root.value?.offsetHeight ?? 0)
const body = computed(() => props.step.body.replace('{shortcut}', props.shortcut))

const root = ref(null)
const style = computed(() => ({
  left: `${Math.round(props.position.x)}px`,
  top: `${Math.round(props.position.y)}px`
}))

// The beak points back at the target from whichever edge faces it. A zone
// callout sits INSIDE its target, so there is nothing to point at.
const centre = (a, span) => a + span / 2
const beak = computed(() => {
  if (props.step.zone) return null
  const tx = centre(props.box.x, props.box.w)
  if (props.box.y + props.box.h <= props.position.y) return 'top'
  if (props.box.y >= props.position.y + (calloutH.value || 0)) return 'bottom'
  return tx < props.position.x ? 'left' : 'right'
})

// Slides along the callout's edge to sit under the TARGET's centre. Pinned at a
// fixed inset it pointed at nothing on a wide target — the file-slots band and
// the settings row both span far wider than the card.
const beakStyle = computed(() => {
  if (!beak.value) return null
  if (beak.value === 'left' || beak.value === 'right') return null
  const offset = centre(props.box.x, props.box.w) - props.position.x - BEAK / 2
  const limit = CALLOUT_W - EDGE - BEAK
  return { left: `${Math.round(Math.max(EDGE, Math.min(limit, offset)))}px` }
})
</script>

<template>
  <div
    ref="root"
    class="tour-callout"
    :class="beak && `beak-${beak}`"
    :style="style"
    role="status"
    aria-live="polite"
  >
    <span v-if="beak" class="tour-beak" :style="beakStyle" aria-hidden="true"></span>
    <span class="tour-step-n">Step {{ index + 1 }} of {{ count }}</span>
    <h6>{{ step.title }}</h6>
    <p class="tour-body">{{ body }}</p>
    <div class="tour-foot">
      <span class="tour-dots" aria-hidden="true">
        <span v-for="n in count" :key="n" class="tour-dot" :class="{ on: n === index + 1 }"></span>
      </span>
      <button class="btn btn-sm btn-ghost" @click="$emit('skip')">Skip tips</button>
      <button class="btn btn-sm btn-primary" @click="$emit('next')">
        {{ isLast ? 'Done' : 'Next' }}
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles/TourCallout.css"></style>
