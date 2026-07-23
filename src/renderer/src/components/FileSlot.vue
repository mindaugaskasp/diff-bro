<script setup>
import { shaped } from '../utils/props'
defineProps({
  side: { type: String, required: true },
  /** @type {import('vue').PropType<import('../types').LoadedFile|null>} */
  file: {
    // A text file carries `content`; a spreadsheet carries `sheets` instead —
    // the slot only ever reads `name`/`path`, so that's all it requires.
    type: Object,
    default: null,
    validator: (v) => v === null || shaped('name')(v)
  },
  // True when this slot is empty and the other side already has a file, so we
  // can visibly prompt for the second file.
  awaiting: { type: Boolean, default: false }
})
const emit = defineEmits(['pick'])
// Drag & drop is handled once at the window level (App.vue); the slot only
// tags itself with data-side so a drop landing on it targets that side.
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
