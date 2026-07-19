<script setup>
import { ref, onMounted } from 'vue'
import { useDiffStore } from '../stores/diffStore'

// Recipient picker with built-in first-time setup: if this install has no
// trusted keys yet, the dialog walks through the one-time key exchange
// (keys themselves are generated automatically — the user never has to
// think about "generating keys").
const diff = useDiffStore()

const recipients = ref([])
const selected = ref(null)
const myFingerprint = ref('')
const exportedPath = ref(null)
const copied = ref(false)

onMounted(async () => {
  // Asking for the fingerprint creates this install's keypairs on first use.
  myFingerprint.value = await window.api.myFingerprint()
  await refresh()
})

async function refresh(preferFp) {
  recipients.value = await window.api.listTrustedKeys()
  selected.value =
    preferFp ?? selected.value ?? recipients.value[recipients.value.length - 1]?.fingerprint ?? null
}

async function exportKey() {
  const res = await window.api.exportPublicKey()
  if (res.ok) exportedPath.value = res.path
}

async function copyKey() {
  const res = await window.api.copyPublicKey()
  if (res.ok) copied.value = true
}

async function addKey() {
  const res = await window.api.addTrustedKey()
  if (res.ok) await refresh(res.fingerprint)
  else if (res.error) diff.showNotice('That file is not a valid Diff Bro public key.')
}

function close() {
  diff.shareEntryId = null
}
</script>

<template>
  <div class="backdrop">
    <!-- Normal case: at least one trusted recipient exists. -->
    <form v-if="recipients.length" class="dialog" @submit.prevent="diff.shareTo(selected)">
      <div class="dialog-header">
        <h3>Share diff</h3>
        <button type="button" class="close-x" aria-label="Close" @click="close">×</button>
      </div>
      <label>
        Seal for recipient
        <select v-model="selected">
          <option v-for="r in recipients" :key="r.fingerprint" :value="r.fingerprint">
            {{ r.label }} ({{ r.fingerprint }})
          </option>
        </select>
      </label>
      <p class="note">
        The file is encrypted so only this recipient can open it, and signed so any modification —
        including its expiry time — is rejected. It expires at the same moment as your local copy.
      </p>
      <div class="actions">
        <button type="button" class="ghost small" @click="addKey">Add recipient…</button>
        <span class="spacer" />
        <button type="submit" class="primary" :disabled="!selected">Create file</button>
        <button type="button" class="ghost" @click="close">Cancel</button>
      </div>
    </form>

    <!-- First-time setup: no trusted keys yet. -->
    <div v-else class="dialog">
      <div class="dialog-header">
        <h3>Share diff — one-time setup</h3>
        <button type="button" class="close-x" aria-label="Close" @click="close">×</button>
      </div>
      <p class="note">
        Shared diffs are sealed for one specific person, so you and your bro first swap public keys
        — once, in both directions. Your keys already exist (created automatically, fingerprint
        <code>{{ myFingerprint }}</code
        >); the private half never leaves this machine.
      </p>

      <div class="step" :class="{ done: exportedPath || copied }">
        <span class="badge">{{ exportedPath || copied ? '✓' : '1' }}</span>
        <div class="step-body">
          <strong>Give them your key</strong>
          <span v-if="copied" class="step-hint"
            >Copied — paste it into your password manager or straight into a message.</span
          >
          <span v-else-if="exportedPath" class="step-hint"
            >Saved — now send that file to them (chat, USB, anything).</span
          >
          <span v-else class="step-hint"
            >Copy it to the clipboard, or save it as a file — either way, send it to them.</span
          >
        </div>
        <div class="step-actions">
          <button type="button" class="ghost small" @click="copyKey">
            {{ copied ? 'Copied ✓' : 'Copy key' }}
          </button>
          <button type="button" class="ghost small" @click="exportKey">
            {{ exportedPath ? 'Save again…' : 'Save as file…' }}
          </button>
        </div>
      </div>

      <div class="step">
        <span class="badge">2</span>
        <div class="step-body">
          <strong>Add their key</strong>
          <span class="step-hint">Open the <code>.diffbrokey</code> file they sent you.</span>
        </div>
        <button type="button" class="primary small" @click="addKey">Add their key…</button>
      </div>

      <p class="note">
        As soon as their key is added you can pick them as a recipient — this dialog updates
        automatically.
      </p>
      <div class="actions">
        <button type="button" class="ghost" @click="close">Cancel</button>
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
  width: 400px;
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
  line-height: 1.5;
}
code {
  color: var(--text);
  font-size: 10.5px;
}
.step {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
}
.step.done {
  border-color: #238636;
}
/* Keeps the two key-handoff buttons together at the row's right edge and
   stops them from stretching when the hint text wraps. */
.step-actions {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
  margin-left: auto;
}
.badge {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  background: var(--bg);
  border: 1px solid var(--border);
}
.step.done .badge {
  background: #238636;
  border-color: #238636;
  color: #fff;
}
.step-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12.5px;
}
.step-hint {
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.4;
}
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
}
.spacer {
  flex: 1;
}
.primary {
  background: var(--accent);
  border: none;
  border-radius: 6px;
  color: #fff;
  padding: 6px 14px;
  cursor: pointer;
  font-weight: 600;
  white-space: nowrap;
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
  white-space: nowrap;
}
.small {
  padding: 4px 10px;
  font-size: 12px;
}
</style>
