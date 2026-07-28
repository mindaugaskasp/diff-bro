<script setup>
import { shaped } from '../utils/props'
defineProps({
  side: { type: String, required: true },
  /** @type {import('vue').PropType<import('../types').LoadedFile|null>} */
  file: {
    // The slot only reads name/path (a spreadsheet carries sheets, not content).
    type: Object,
    default: null,
    validator: (v) => v === null || shaped('name')(v)
  },
  // True when this slot is empty and the other side already has a file, so we
  // can visibly prompt for the second file.
  awaiting: { type: Boolean, default: false }
})
const emit = defineEmits(['pick'])
// Drag & drop is window-level (App.vue); the slot just tags itself data-side.
</script>

<template>
  <button
    class="slot"
    :class="{ filled: !!file, awaiting }"
    :data-side="side"
    :title="file ? file.path : `Choose ${side} file`"
    @click="emit('pick')"
  >
    <span v-if="file" class="name">{{ file.name }}</span>
    <span v-else class="placeholder">{{
      awaiting ? `drop the ${side} file here` : `${side} file…`
    }}</span>
  </button>
</template>

<style scoped src="./styles/FileSlot.css"></style>
