<script setup>
// The card beside the spotlit control. Its face is --bg-elevated and its
// keyline --btn-edge: against a scrimmed ground those two swap roles by theme —
// the face separates it on the seven light grounds (up to 3.23:1), the keyline
// on the seven dark ones (up to 18.4:1). A --bg-raised card with a plain
// --border keyline measured under floor on 11 of the 14.
import { computed, ref } from 'vue'
import { shaped } from '../../../utils/props'
import { CALLOUT_W } from '../../../utils/spotlight'
import { t } from '../../../i18n'

const props = defineProps({
  step: { type: Object, required: true, validator: shaped('id', 'target', 'body') },
  index: { type: Number, required: true },
  count: { type: Number, required: true },
  position: { type: Object, required: true, validator: shaped('x', 'y') },
  box: { type: Object, required: true, validator: shaped('x', 'y', 'w', 'h') },
  shortcut: { type: String, default: '' },
  anchored: { type: Boolean, default: true }
})
defineEmits(['next', 'back', 'skip'])

const BEAK = 9
const EDGE = 14
const isLast = computed(() => props.index === props.count - 1)
// A step that acts says so on the button that does it. "Next" on a control that
// is about to open Settings is exactly the surprise this tour is meant to avoid.
const nextLabel = computed(() =>
  props.step.nextLabelKey ? t(props.step.nextLabelKey) : t(isLast.value ? 'tour.done' : 'tour.next')
)
const progress = computed(() => `${Math.round(((props.index + 1) / props.count) * 100)}%`)
const calloutH = computed(() => root.value?.offsetHeight ?? 0)
// {shortcut} is vue-i18n's own interpolation now, not a manual replace.
const body = computed(() => t(props.step.bodyKey, { shortcut: props.shortcut }))

const root = ref(null)
const style = computed(() => ({
  left: `${Math.round(props.position.x)}px`,
  top: `${Math.round(props.position.y)}px`
}))

// The beak points back at the target from whichever edge faces it. A zone
// callout sits INSIDE its target, and an unanchored one has no target at all.
const centre = (a, span) => a + span / 2
const beak = computed(() => {
  if (props.step.zone || !props.anchored) return null
  const tx = centre(props.box.x, props.box.w)
  if (props.box.y + props.box.h <= props.position.y) return 'top'
  if (props.box.y >= props.position.y + (calloutH.value || 0)) return 'bottom'
  return tx < props.position.x ? 'left' : 'right'
})

// Slides along the card's edge to sit on the TARGET's centre, on whichever axis
// faces it. A fixed inset pointed at nothing on a wide target; a fixed 50%
// pointed past a search box sitting near the card's top edge.
const beakStyle = computed(() => {
  if (!beak.value) return null
  const sideways = beak.value === 'left' || beak.value === 'right'
  const span = sideways ? calloutH.value : CALLOUT_W
  const middle = sideways ? centre(props.box.y, props.box.h) : centre(props.box.x, props.box.w)
  const from = sideways ? props.position.y : props.position.x
  const limit = Math.max(EDGE, span - EDGE - BEAK)
  const offset = Math.max(EDGE, Math.min(limit, middle - from - BEAK / 2))
  return { [sideways ? 'top' : 'left']: `${Math.round(offset)}px` }
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
    <div class="tour-head">
      <span class="tour-step-n">Step {{ index + 1 }} of {{ count }}</span>
      <span class="tour-progress" aria-hidden="true">
        <span :style="{ width: progress }"></span>
      </span>
    </div>
    <h6>{{ $t(step.titleKey) }}</h6>
    <p class="tour-body">{{ body }}</p>
    <div class="tour-foot">
      <button v-if="index > 0" class="btn btn-sm tour-back" @click="$emit('back')">Back</button>
      <button class="btn btn-sm btn-ghost" @click="$emit('skip')">Skip tips</button>
      <button class="btn btn-sm btn-primary" @click="$emit('next')">{{ nextLabel }}</button>
    </div>
  </div>
</template>

<style scoped src="./styles/TourCallout.css"></style>
