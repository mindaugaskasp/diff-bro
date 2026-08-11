<script setup>
// A side pane's take buttons, on the edge facing the result. Real buttons over
// the editor rather than glyphs in its margin, so they are reachable by
// keyboard and can sit where the text is going.
import { computed } from 'vue'
import AppIcon from '../../../components/AppIcon.vue'

const props = defineProps({
  side: { type: String, required: true, validator: (v) => v === 'ours' || v === 'theirs' },
  /** @type {Array<{index: number, top: number, dim: boolean}>} */
  buttons: { type: Array, required: true }
})
defineEmits(['take'])

const isOurs = computed(() => props.side === 'ours')
// Both keys named literally, so the extractor can see them.
const tipKey = computed(() => (isOurs.value ? 'merge.takeOursTip' : 'merge.takeTheirsTip'))
const icon = computed(() => (isOurs.value ? 'chevron-right' : 'chevron-left'))
</script>

<template>
  <div class="merge-takes" :class="side" aria-hidden="false">
    <button
      v-for="button in buttons"
      :key="button.index"
      class="merge-take-btn"
      :class="{ dim: button.dim }"
      :style="{ top: `${button.top}px` }"
      :data-tip="$t(tipKey)"
      :aria-label="$t(tipKey)"
      :data-testid="`merge-take-${side}-${button.index}`"
      @click="$emit('take', button.index)"
    >
      <AppIcon :name="icon" />
    </button>
  </div>
</template>

<style scoped src="./styles/MergeTakeOverlay.css"></style>
