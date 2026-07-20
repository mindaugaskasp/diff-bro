<script setup>
import { computed } from 'vue'
import { useDiffStore } from '../stores/diffStore'

const diff = useDiffStore()

const current = computed(() => `${diff.left?.name ?? '?'} ↔ ${diff.right?.name ?? '?'}`)
const dropped = computed(() => {
  const n = diff.pendingReplace?.length ?? 0
  return n >= 2 ? 'two new files' : 'a new file'
})
</script>

<template>
  <div class="backdrop">
    <div class="dialog">
      <div class="dialog-header">
        <h3>Replace current comparison?</h3>
        <button type="button" class="close-x" aria-label="Close" @click="diff.cancelReplace()">
          ×
        </button>
      </div>
      <p class="note">
        You dropped {{ dropped }}. Loading it will discard the comparison you have open (<code>{{
          current
        }}</code
        >). Save it first if you want to keep it.
      </p>
      <div class="actions">
        <button class="ghost" @click="diff.cancelReplace()">Cancel</button>
        <span class="spacer" />
        <button class="ghost" @click="diff.saveThenReplace()">Save first</button>
        <button class="danger" @click="diff.confirmReplace()">Replace anyway</button>
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
  z-index: 40;
}
.dialog {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  width: 420px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
h3 {
  margin: 0;
  font-size: 14px;
}
.close-x {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 20px;
  line-height: 1;
  padding: 0 4px;
  cursor: pointer;
}
.close-x:hover {
  color: var(--text);
}
.note {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-dim);
  line-height: 1.5;
}
.note code {
  color: var(--text);
  font-size: 11.5px;
}
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.spacer {
  flex: 1;
}
.ghost {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 6px 12px;
  cursor: pointer;
}
.ghost:hover {
  border-color: var(--accent);
}
.danger {
  background: #b0311f;
  border: 1px solid #b0311f;
  border-radius: 6px;
  color: #fff;
  font-weight: 600;
  padding: 6px 14px;
  cursor: pointer;
}
.danger:hover {
  filter: brightness(1.1);
}
</style>
