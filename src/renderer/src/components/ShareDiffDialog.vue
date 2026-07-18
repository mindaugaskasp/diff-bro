<script setup>
import { ref, onMounted } from 'vue'
import { useDiffStore } from '../stores/diffStore'

const diff = useDiffStore()
const recipients = ref([])
const selected = ref(null)

onMounted(async () => {
  recipients.value = await window.api.listTrustedKeys()
  selected.value = recipients.value[0]?.fingerprint ?? null
})
</script>

<template>
  <div class="backdrop" @click.self="diff.shareEntryId = null">
    <form class="dialog" @submit.prevent="diff.shareTo(selected)">
      <h3>Share diff</h3>
      <label>
        Seal for recipient
        <select v-model="selected">
          <option v-for="r in recipients" :key="r.fingerprint" :value="r.fingerprint">
            {{ r.label }} ({{ r.fingerprint }})
          </option>
        </select>
      </label>
      <p class="note">
        The file is encrypted so only this recipient can open it, and signed
        so any modification — including its expiry time — is rejected. It
        expires at the same moment as your local copy.
      </p>
      <div class="actions">
        <button type="submit" class="primary" :disabled="!selected">Create file</button>
        <button type="button" class="ghost" @click="diff.shareEntryId = null">Cancel</button>
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
select {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 6px 8px;
  font-size: 13px;
}
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
.primary:disabled {
  opacity: 0.4;
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
