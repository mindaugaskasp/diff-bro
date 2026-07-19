<script setup>
import { ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'

const diff = useDiffStore()
const label = ref(diff.pendingTrustedKey?.label ?? '')

function add() {
  diff.confirmTrustedKey(label.value)
}
</script>

<template>
  <div class="backdrop">
    <form class="dialog" @submit.prevent="add">
      <div class="dialog-header">
        <h3>Add trusted key</h3>
        <button type="button" class="close-x" aria-label="Close" @click="diff.cancelTrustedKey()">
          ×
        </button>
      </div>
      <p class="note">
        Give this host a name you'll recognize when picking a share recipient. Fingerprint
        <code>{{ diff.pendingTrustedKey?.fingerprint }}</code
        >.
      </p>
      <label>
        Name
        <input
          v-model="label"
          type="text"
          spellcheck="false"
          placeholder="e.g. Alice — laptop"
          autofocus
        />
      </label>
      <div class="actions">
        <button type="submit" class="primary" :disabled="!label.trim()">Add</button>
        <button type="button" class="ghost" @click="diff.cancelTrustedKey()">Cancel</button>
      </div>
    </form>
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
  width: 360px;
  display: flex;
  flex-direction: column;
  gap: 10px;
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
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.5;
}
code {
  color: var(--text);
  font-size: 10.5px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-dim);
}
input {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 6px 8px;
  font-size: 13px;
}
input:focus {
  outline: none;
  border-color: var(--accent);
}
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.primary {
  background: var(--accent);
  border: none;
  border-radius: 6px;
  color: #fff;
  padding: 6px 14px;
  cursor: pointer;
  font-weight: 600;
}
.primary:disabled {
  opacity: 0.4;
  cursor: default;
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
