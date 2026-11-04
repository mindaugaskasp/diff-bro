<script setup>
import { computed, ref } from 'vue'
import { shaped } from '../../../utils/props'
import { COACH_W, coachPlacement } from '../coachPlacement'
import TargetRing from './TargetRing.vue'

const props = defineProps({
  /** @type {import('vue').PropType<import('../../../types').Tip>} */
  tip: { type: Object, required: true, validator: shaped('id', 'show') },
  /** @type {import('vue').PropType<import('../../../types').ScreenRect>} */
  rect: { type: Object, required: true, validator: shaped('x', 'y', 'w', 'h') }
})

const root = ref(null)
const FALLBACK_H = 44
const px = (n) => `${Math.round(n)}px`
const place = computed(() =>
  coachPlacement({
    rect: props.rect,
    side: props.tip.show.side,
    height: root.value?.offsetHeight || FALLBACK_H,
    stage: { w: window.innerWidth, h: window.innerHeight }
  })
)
const style = computed(() => ({
  left: px(place.value.left),
  top: px(place.value.top),
  width: px(COACH_W)
}))
const pointerStyle = computed(() =>
  place.value.pointer === 'left'
    ? { top: px(place.value.offset) }
    : { left: px(place.value.offset) }
)
</script>

<template>
  <TargetRing :rect="rect" />
  <div
    ref="root"
    class="tip-note"
    :class="`points-${place.pointer}`"
    :style="style"
    role="status"
    :data-tip-note="tip.id"
  >
    <span class="tn-pointer" :style="pointerStyle" aria-hidden="true"></span>
    <p class="tn-text">{{ $t(tip.show.noteKey) }}</p>
  </div>
</template>

<style scoped src="./styles/TipShowMe.css"></style>
