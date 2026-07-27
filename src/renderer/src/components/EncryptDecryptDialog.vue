<script setup>
import { ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useSettingsStore } from '../stores/settingsStore'
import { PASSPHRASE_HINT, passphraseTooShort } from '../passphrase'
import { useFileTextDrop } from '../composables/useFileDrop'
import BaseDialog from './BaseDialog.vue'

const store = useDiffStore()
const settings = useSettingsStore()
const input = ref('')
const { onDropFile } = useFileTextDrop((text) => {
  input.value = text
})
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
  await window.api.copyText(output.value)
  store.showNotice('Copied to clipboard.')
}

function close() {
  store.showCryptDialog = false
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
        Passphrase
        <input v-model="passphrase" type="password" autocomplete="off" spellcheck="false" />
      </label>
    </div>
    <div class="dialog-actions">
      <button class="btn btn-primary" :disabled="busy || !input" @click="encrypt">Encrypt →</button>
      <button class="btn btn-primary" :disabled="busy || !input" @click="decrypt">Decrypt →</button>
    </div>
    <label>
      Output
      <textarea v-model="output" readonly spellcheck="false"></textarea>
    </label>
    <p v-if="error" class="error">{{ error }}</p>
    <template #actions>
      <button class="btn btn-ghost" :disabled="!output" @click="useOutputAsInput">
        Use output as input
      </button>
      <button class="btn btn-ghost" :disabled="!output" @click="copyOutput">Copy output</button>
      <button class="btn btn-ghost" @click="close">Close</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/EncryptDecryptDialog.css"></style>
