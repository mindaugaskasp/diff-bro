<script setup>
import { ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useSettingsStore } from '../stores/settingsStore'
import { PASSPHRASE_HINT, passphraseTooShort } from '../passphrase'
import { useFileTextDrop } from '../composables/useFileDrop'
import BaseDialog from './BaseDialog.vue'
import { useUiStore } from '../stores/uiStore'

const store = useDiffStore()

const ui = useUiStore()
const settings = useSettingsStore()
const input = ref('')
const { onDropFile } = useFileTextDrop((text) => {
  input.value = text
})
const output = ref('')
const passphrase = ref('')
// 'passphrase' (GCM, encrypt+decrypt) | 'rawkey' (AES-256-CBC, decrypt-only interop).
const keyMode = ref('passphrase')
const rawKey = ref('')
const rawIv = ref('')
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
  if (keyMode.value === 'rawkey') return decryptRaw()
  if (!passphrase.value) {
    error.value = 'Enter a passphrase first.'
    return
  }
  await run(() => window.api.decryptText(input.value, passphrase.value))
}

async function decryptRaw() {
  if (!rawKey.value || !rawIv.value) {
    error.value = 'Enter the key and IV.'
    return
  }
  await run(() =>
    window.api.decryptTextRaw({ ciphertext: input.value, key: rawKey.value, iv: rawIv.value })
  )
}

async function run(op) {
  busy.value = true
  try {
    const res = await op()
    if (res.ok) output.value = res.plaintext
    else {
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
  await window.api.copyText(output.value)
  store.showNotice('Copied to clipboard.')
}

function close() {
  ui.showCryptDialog = false
}
</script>

<template>
  <BaseDialog
    width="560px"
    resizable
    close-on-backdrop
    :initial-size="settings.dialogSize('encrypt')"
    title="Encrypt / Decrypt Text"
    @close="close"
    @resize="(s) => settings.setDialogSize('encrypt', s)"
  >
    <p class="dialog-note">
      Local only — the passphrase and text never leave this machine and are not saved anywhere.
      Encrypts with authenticated AES-256-GCM, so tampering is always detected on decrypt.
    </p>
    <label>
      Input
      <textarea
        v-model="input"
        spellcheck="false"
        placeholder="Plain text to encrypt, or an encrypted blob to decrypt… (or drop a file here)"
        @dragover.capture.prevent.stop
        @drop.capture.prevent.stop="onDropFile"
      ></textarea>
    </label>
    <div class="row">
      <label class="grow">
        Key type
        <select v-model="keyMode">
          <option value="passphrase">Passphrase — AES-256-GCM (authenticated)</option>
          <option value="rawkey">Raw key — AES-256-CBC (decrypt only, unauthenticated)</option>
        </select>
      </label>
    </div>
    <div v-if="keyMode === 'passphrase'" class="row">
      <label class="grow">
        Passphrase
        <input v-model="passphrase" type="password" autocomplete="off" spellcheck="false" />
      </label>
    </div>
    <template v-else>
      <div class="row">
        <label class="grow">
          Key <span class="hint">(hex or base64)</span>
          <input
            v-model="rawKey"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="32 bytes — 64 hex or base64"
          />
        </label>
        <label class="grow">
          IV <span class="hint">(hex or base64)</span>
          <input
            v-model="rawIv"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="16 bytes — 32 hex or base64"
          />
        </label>
      </div>
      <p class="warn">
        AES-256-CBC is <strong>unauthenticated</strong> — a successful decrypt does not prove the
        data is untampered. For decrypting external payloads only.
      </p>
    </template>
    <div class="dialog-actions">
      <button
        v-if="keyMode === 'passphrase'"
        class="btn btn-primary"
        :disabled="busy || !input"
        @click="encrypt"
      >
        Encrypt →
      </button>
      <button class="btn btn-primary" :disabled="busy || !input" @click="decrypt">Decrypt →</button>
    </div>
    <label>
      Output
      <textarea v-model="output" readonly spellcheck="false"></textarea>
    </label>
    <p v-if="error" class="error">{{ error }}</p>
    <template #actions>
      <button class="btn" :disabled="!output" @click="useOutputAsInput">Use output as input</button>
      <button class="btn" :disabled="!output" @click="copyOutput">Copy output</button>
      <button class="btn btn-ghost" @click="close">Close</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/EncryptDecryptDialog.css"></style>
