<script setup>
import AppIcon from '../../../components/AppIcon.vue'
import { shaped } from '../../../utils/props'

defineProps({
  /** @type {import('vue').PropType<import('../../../types').RunGutterSpot|null>} */
  spot: {
    type: Object,
    default: null,
    validator: (v) => v === null || shaped('line', 'lastLine', 'top')(v)
  }
})
defineEmits(['run', 'enter', 'leave'])
</script>

<template>
  <button
    v-if="spot"
    type="button"
    class="run-gutter"
    :style="{
      top: `${spot.top}px`,
      left: `${spot.left}px`,
      width: `${spot.width}px`,
      height: `${spot.height}px`
    }"
    :aria-label="$t('runner.runUpToLine', { n: spot.lastLine })"
    :data-tip="$t('runner.runUpToLine', { n: spot.lastLine })"
    @mouseenter="$emit('enter')"
    @mouseleave="$emit('leave')"
    @click="$emit('run')"
  >
    <AppIcon name="play" />
  </button>
</template>

<style scoped src="./styles/RunGutterButton.css"></style>
