<script setup>
import { ref } from 'vue'

defineProps({
  side: { type: String, required: true },
  file: { type: Object, default: null }
})
const emit = defineEmits(['pick', 'drop-path'])

const hover = ref(false)

function onDrop(e) {
  hover.value = false
  const dropped = e.dataTransfer?.files?.[0]
  if (!dropped) return
  const path = window.api.getPathForFile(dropped)
  if (path) emit('drop-path', path)
}
</script>

<template>
  <button
    class="slot"
    :class="{ hover, filled: !!file }"
    :title="file ? file.path : `Choose ${side} file`"
    @click="emit('pick')"
    @dragover.prevent="hover = true"
    @dragleave="hover = false"
    @drop.prevent="onDrop"
  >
    <span v-if="file" class="name">{{ file.name }}</span>
    <span v-else class="placeholder">{{ side }} file…</span>
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
