<script setup>
import { computed } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'

const store = useSnippetStore()
const pending = computed(() => store.pendingDelete)
const label = computed(() => (pending.value?.type === 'category' ? 'category' : 'snippet'))
</script>

<template>
  <div v-if="pending" class="backdrop">
    <div class="dialog">
      <h3>Delete {{ label }}?</h3>
      <p class="note">
        Delete the {{ label }} <strong>“{{ pending.name }}”</strong>? This can’t be undone.
      </p>
      <div class="actions">
        <button class="danger" @click="store.confirmDelete()">Delete</button>
        <button class="ghost" @click="store.cancelDelete()">Cancel</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}
.dialog {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
h3 {
  margin: 0;
  font-size: 14px;
}
.note {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-dim);
  line-height: 1.5;
}
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.danger {
  background: var(--danger-bg);
  border: none;
  border-radius: 6px;
  color: var(--danger-text);
  padding: 6px 14px;
  cursor: pointer;
  font-weight: 600;
}
.ghost {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 6px 12px;
  cursor: pointer;
}
</style>
