<script setup>
import { ref, onMounted } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useVaultStore, DEFAULT_TTL_HOURS, TTL_OPTIONS } from '../stores/vaultStore'

const diff = useDiffStore()
const vault = useVaultStore()

const name = ref('')
const ttl = ref(DEFAULT_TTL_HOURS)
const nameInput = ref(null)

onMounted(() => {
  name.value =
    diff.mode === 'paste'
      ? `Pasted text (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
      : `${diff.left?.name ?? '?'} ↔ ${diff.right?.name ?? '?'}`
  nameInput.value?.focus()
  nameInput.value?.select()
})

async function save() {
  const id = await vault.save(name.value.trim(), ttl.value, diff.snapshot())
  diff.showSaveDialog = false
  if (diff.saveThenShare) {
    // "Share" flow: continue straight into the recipient picker.
    diff.saveThenShare = false
    diff.shareEntryId = id
  } else {
    diff.showNotice(`Saved (encrypted) — expires in ${ttl.value} h.`)
  }
}

function cancel() {
  diff.showSaveDialog = false
  diff.saveThenShare = false
}
</script>

<template>
  <div class="backdrop" @click.self="cancel">
    <form class="dialog" @submit.prevent="save">
      <h3>{{ diff.saveThenShare ? 'Share diff — step 1 of 2: save it' : 'Save diff' }}</h3>
      <label>
        Name
        <input ref="nameInput" v-model="name" type="text" spellcheck="false" />
      </label>
      <label>
        Expires after
        <select v-model.number="ttl">
          <option v-for="opt in TTL_OPTIONS" :key="opt.hours" :value="opt.hours">
            {{ opt.label }}
          </option>
        </select>
      </label>
      <p class="note">
        Stored encrypted on this machine only and deleted automatically — 24 hours is the maximum.
      </p>
      <div class="actions">
        <button type="submit" class="primary">
          {{ diff.saveThenShare ? 'Next: choose recipient' : 'Save' }}
        </button>
        <button type="button" class="ghost" @click="cancel">Cancel</button>
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
  z-index: 10;
}
.dialog {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  width: 340px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
h3 {
  margin: 0;
  font-size: 14px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-dim);
}
input,
select {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 6px 8px;
  font-size: 13px;
}
input:focus,
select:focus {
  outline: none;
  border-color: var(--accent);
}
.note {
  margin: 0;
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.4;
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
.ghost {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 6px 12px;
  cursor: pointer;
}
</style>
