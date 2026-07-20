<script setup>
import { ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { PASSPHRASE_HINT, passphraseTooShort } from '../passphrase'

const store = useDiffStore()
const input = ref('')
const output = ref('')
const passphrase = ref('')
const error = ref(null)
const busy = ref(false)

async function encrypt() {
  error.value = null
  if (!passphrase.value) {
    error.value = 'Enter a passphrase first.'
    return
  }
  if (passphraseTooShort(passphrase.value)) {
    error.value = PASSPHRASE_HINT
    return
  }
  busy.value = true
  try {
    output.value = await window.api.encryptText(input.value, passphrase.value)
  } finally {
    busy.value = false
  }
}

async function decrypt() {
  error.value = null
  if (!passphrase.value) {
    error.value = 'Enter a passphrase first.'
    return
  }
  busy.value = true
  try {
    const res = await window.api.decryptText(input.value, passphrase.value)
    if (res.ok) {
      output.value = res.plaintext
    } else {
      output.value = ''
      error.value = res.error
    }
  } finally {
    busy.value = false
  }
}

function useOutputAsInput() {
  input.value = output.value
  output.value = ''
  error.value = null
}

async function copyOutput() {
  await navigator.clipboard.writeText(output.value)
  store.showNotice('Copied to clipboard.')
}

function close() {
  store.showCryptDialog = false
}
</script>

<template>
  <div class="backdrop">
    <div class="dialog">
      <div class="dialog-header">
        <h3>Encrypt / Decrypt Text</h3>
        <button type="button" class="close-x" aria-label="Close" @click="close">×</button>
      </div>
      <p class="note">
        Local only — the passphrase and text never leave this machine and are not saved anywhere.
        Encrypts with authenticated AES-256-GCM, so tampering is always detected on decrypt.
      </p>
      <label>
        Input
        <textarea
          v-model="input"
          spellcheck="false"
          placeholder="Plain text to encrypt, or an encrypted blob to decrypt…"
        ></textarea>
      </label>
      <div class="row">
        <label class="grow">
          Passphrase
          <input v-model="passphrase" type="password" autocomplete="off" spellcheck="false" />
        </label>
      </div>
      <div class="actions">
        <button class="primary" :disabled="busy || !input" @click="encrypt">Encrypt →</button>
        <button class="primary" :disabled="busy || !input" @click="decrypt">Decrypt →</button>
      </div>
      <label>
        Output
        <textarea v-model="output" readonly spellcheck="false"></textarea>
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="actions">
        <button class="ghost" :disabled="!output" @click="useOutputAsInput">
          Use output as input
        </button>
        <button class="ghost" :disabled="!output" @click="copyOutput">Copy output</button>
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
  z-index: 10;
}
.dialog {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  width: 560px;
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
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.4;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-dim);
}
.row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}
.row .grow {
  flex: 1;
}
textarea,
input,
select {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 7px 8px;
  font-size: 12.5px;
}
textarea {
  font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
  resize: vertical;
  height: 100px;
}
textarea:focus,
input:focus,
select:focus {
  outline: none;
  border-color: var(--accent);
}
.error {
  margin: 0;
  font-size: 12px;
  color: var(--danger-bg);
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
.ghost:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
