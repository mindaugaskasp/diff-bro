<script setup>
import { onMounted, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'

const diff = useDiffStore()
const label = ref('')
const fingerprint = ref('')
const busy = ref(false)

onMounted(async () => {
  // Prefill the name the user set before (if any) and show this key's
  // fingerprint so they can read it out to the other person out of band.
  label.value = (await window.api.myKeyLabel()) ?? ''
  fingerprint.value = (await window.api.myFingerprint()) ?? ''
})

async function save() {
  if (busy.value) return
  busy.value = true
  try {
    await diff.runExportKey(label.value)
  } finally {
    busy.value = false
  }
}
async function copy() {
  if (busy.value) return
  busy.value = true
  try {
    await diff.runCopyKey(label.value)
  } finally {
    busy.value = false
  }
}
function close() {
  diff.showShareKeyDialog = false
}
</script>

<template>
  <div class="backdrop">
    <div class="dialog">
      <div class="dialog-header">
        <h3>Share my public key</h3>
        <button type="button" class="close-x" aria-label="Close" @click="close">×</button>
      </div>

      <p class="note">
        This is <strong>your</strong> public key — hand it to the other person so they can receive
        diffs you share. To receive <em>their</em> diffs, use
        <strong>Security → Add Trusted Key</strong> on the file <em>they</em> send you. You never
        import your own key.
      </p>

      <label>
        Name others will see
        <input
          v-model="label"
          type="text"
          spellcheck="false"
          maxlength="80"
          placeholder="e.g. Alice — laptop"
        />
      </label>
      <p class="hint">
        Shown to whoever imports this key, so they recognize it's from you. Not secret, and not part
        of the key's identity.
      </p>

      <p v-if="fingerprint" class="fp">
        Fingerprint: <code>{{ fingerprint }}</code>
      </p>

      <div class="actions">
        <button class="primary" :disabled="busy" @click="save">Save to file…</button>
        <button class="ghost" :disabled="busy" @click="copy">Copy to clipboard</button>
        <button class="ghost" @click="close">Close</button>
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
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.5;
}
.note strong {
  color: var(--text);
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
.hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.4;
}
.fp {
  margin: 0;
  font-size: 11px;
  color: var(--text-dim);
}
.fp code {
  color: var(--text);
  font-size: 11px;
}
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
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
.ghost:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
