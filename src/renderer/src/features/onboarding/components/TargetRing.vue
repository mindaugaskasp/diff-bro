<script setup>
import { computed } from 'vue'
import { shaped } from '../../../utils/props'

const props = defineProps({
  /** @type {import('vue').PropType<import('../../../types').ScreenRect>} */
  rect: { type: Object, required: true, validator: shaped('x', 'y', 'w', 'h') }
})
const OUTSET = 4
const style = computed(() => ({
  left: `${Math.round(props.rect.x - OUTSET)}px`,
  top: `${Math.round(props.rect.y - OUTSET)}px`,
  width: `${Math.round(props.rect.w + OUTSET * 2)}px`,
  height: `${Math.round(props.rect.h + OUTSET * 2)}px`
}))
</script>

<template>
  <div class="target-ring" :style="style" aria-hidden="true"></div>
</template>

<style scoped src="./styles/TargetRing.css"></style>
