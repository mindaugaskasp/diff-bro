<script setup>
import { computed, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'

const diff = useDiffStore()
const passphrase = ref('')
const busy = ref(false)
const isBackup = computed(() => diff.configMode === 'backup')

async function submit() {
  if (!passphrase.value || busy.value) return
  busy.value = true
  try {
    if (isBackup.value) await diff.runConfigBackup(passphrase.value)
    else await diff.runConfigRestore(passphrase.value)
    close()
  } finally {
    busy.value = false
  }
}

function close() {
  diff.configMode = null
  passphrase.value = ''
}
</script>

<template>
  <div class="backdrop">
    <form class="dialog" @submit.prevent="submit">
      <div class="dialog-header">
        <h3>{{ isBackup ? 'Back up configuration' : 'Restore configuration' }}</h3>
        <button type="button" class="close-x" aria-label="Close" @click="close">×</button>
      </div>
      <p class="note">
        <template v-if="isBackup">
          Encrypts your identity keys, trusted hosts, snippets and settings into one
          passphrase-protected file. Saved diffs are not included. Keep the passphrase safe — it's
          the only way to restore.
        </template>
        <template v-else>
          Restores identity keys, trusted hosts, snippets and settings from a backup file. Enter the
          passphrase it was created with. This overwrites your current identity keys.
        </template>
      </p>
      <label>
        Passphrase
        <input
          v-model="passphrase"
          type="password"
          autocomplete="off"
          spellcheck="false"
          autofocus
        />
      </label>
      <div class="actions">
        <button type="submit" class="primary" :disabled="!passphrase || busy">
          {{ isBackup ? 'Back up' : 'Restore' }}
        </button>
        <button type="button" class="ghost" @click="close">Cancel</button>
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
  z-index: 30;
}
.dialog {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  width: 380px;
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
