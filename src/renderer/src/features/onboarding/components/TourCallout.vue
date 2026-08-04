<script setup>
// The card beside the spotlit control. Its face is --bg-elevated and its
// keyline --btn-edge: against a scrimmed ground those two swap roles by theme —
// the face separates it on the seven light grounds (up to 3.23:1), the keyline
// on the seven dark ones (up to 18.4:1). A --bg-raised card with a plain
// --border keyline measured under floor on 11 of the 14.
import { computed } from 'vue'
import { shaped } from '../../../utils/props'

const props = defineProps({
  step: { type: Object, required: true, validator: shaped('id', 'target', 'body') },
  index: { type: Number, required: true },
  count: { type: Number, required: true },
  position: { type: Object, required: true, validator: shaped('x', 'y') },
  box: { type: Object, required: true, validator: shaped('x', 'y', 'w', 'h') },
  shortcut: { type: String, default: '' }
})
defineEmits(['next', 'skip'])

const isLast = computed(() => props.index === props.count - 1)
const body = computed(() => props.step.body.replace('{shortcut}', props.shortcut))

const style = computed(() => ({
  left: `${Math.round(props.position.x)}px`,
  top: `${Math.round(props.position.y)}px`
}))

// The beak points back at the target from whichever edge faces it. A zone
// callout sits INSIDE its target, so there is nothing to point at.
const beak = computed(() => {
  if (props.step.zone) return null
  const cx = props.position.x + 148
  const tx = props.box.x + props.box.w / 2
  const ty = props.box.y + props.box.h / 2
  const horizontal = Math.abs(tx - cx) > Math.abs(ty - (props.position.y + 80))
  return horizontal ? (tx < cx ? 'left' : 'right') : ty < props.position.y ? 'top' : 'bottom'
})
</script>

<template>
  <div
    class="tour-callout"
    :class="beak && `beak-${beak}`"
    :style="style"
    role="dialog"
    aria-live="polite"
  >
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
