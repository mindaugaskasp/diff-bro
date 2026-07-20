<script setup>
defineProps({
  side: { type: String, required: true },
  file: { type: Object, default: null },
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

<style scoped>
.slot {
  flex: 1;
  min-width: 0;
  text-align: left;
  background: var(--bg);
  border: 1px dashed var(--border);
  border-radius: 6px;
  color: var(--text-dim);
  padding: 6px 10px;
  cursor: pointer;
  overflow: hidden;
}
.slot.filled {
  border-style: solid;
  color: var(--text);
}
.slot.hover {
  border-color: var(--accent);
}
/* The still-needed side: accent dashed border + a gentle pulse to draw the eye. */
.slot.awaiting {
  border-color: var(--accent);
  color: var(--accent);
  animation: awaiting-pulse 1.6s ease-in-out infinite;
}
@keyframes awaiting-pulse {
  0%,
  100% {
    opacity: 0.65;
  }
  50% {
    opacity: 1;
  }
}
.slot.awaiting .placeholder {
  text-transform: none;
}
.name,
.placeholder {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.placeholder {
  text-transform: capitalize;
}
</style>
