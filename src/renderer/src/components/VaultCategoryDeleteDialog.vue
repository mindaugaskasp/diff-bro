<script setup>
import { computed } from 'vue'
import { useVaultStore } from '../stores/vaultStore'

const vault = useVaultStore()
const pending = computed(() => vault.pendingDelete)
const isCategory = computed(() => pending.value?.type === 'category')
</script>

<template>
  <div v-if="pending" class="backdrop">
    <div class="dialog">
      <h3>{{ isCategory ? 'Delete category?' : 'Delete saved diff?' }}</h3>
      <p class="note">
        Delete <strong>“{{ pending.name }}”</strong>?
        <template v-if="isCategory">
          Saved diffs already expire on their own; the category itself is removed now.
        </template>
        This can’t be undone.
      </p>
      <div class="actions">
        <button class="danger" @click="vault.confirmDelete()">Delete</button>
        <button class="ghost" @click="vault.cancelDelete()">Cancel</button>
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
