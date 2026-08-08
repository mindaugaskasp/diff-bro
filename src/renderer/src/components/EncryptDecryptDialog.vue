<script setup>
import { ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useSettingsStore } from '../stores/settingsStore'
import { PASSPHRASE_HINT, passphraseTooShort } from '../passphrase'
import { useFileTextDrop } from '../composables/useFileDrop'
import BaseDialog from './BaseDialog.vue'
import { useUiStore } from '../stores/uiStore'
import { t } from '../i18n'

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
    error.value = t('encryptDecryptDialog.passphraseFirst')
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
    error.value = t('encryptDecryptDialog.passphraseFirst')
    return
  }
  await run(() => window.api.decryptText(input.value, passphrase.value))
}

async function decryptRaw() {
  if (!rawKey.value || !rawIv.value) {
    error.value = t('encryptDecryptDialog.keyAndIvNeeded')
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
  store.showNotice(t('encryptDecryptDialog.copied'))
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
    :title="$t('encryptDecryptDialog.encryptDecryptText')"
    @close="close"
    @resize="(s) => settings.setDialogSize('encrypt', s)"
  >
    <p class="dialog-note">
      {{ $t('encryptDecryptDialog.localOnlyThePassphraseAnd') }}
    </p>
    <label>
      {{ $t('encryptDecryptDialog.input') }}
      <textarea
        v-model="input"
        spellcheck="false"
        :placeholder="$t('encryptDecryptDialog.plainTextToEncryptOr')"
        @dragover.capture.prevent.stop
        @drop.capture.prevent.stop="onDropFile"
      ></textarea>
    </label>
    <div class="row">
      <label class="grow">
        {{ $t('encryptDecryptDialog.keyType') }}
        <select v-model="keyMode">
          <option value="passphrase">
            {{ $t('encryptDecryptDialog.passphraseAES256GCMAuthenticated') }}
          </option>
          <option value="rawkey">{{ $t('encryptDecryptDialog.rawKeyAES256CBC') }}</option>
        </select>
      </label>
    </div>
    <div v-if="keyMode === 'passphrase'" class="row">
      <label class="grow">
        {{ $t('encryptDecryptDialog.passphrase') }}
        <input v-model="passphrase" type="password" autocomplete="off" spellcheck="false" />
      </label>
    </div>
    <template v-else>
      <div class="row">
        <label class="grow">
          {{ $t('encryptDecryptDialog.key') }}
          <span class="hint">{{ $t('encryptDecryptDialog.hexOrBase64') }}</span>
          <input
            v-model="rawKey"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :placeholder="$t('encryptDecryptDialog.32Bytes64HexOr')"
          />
        </label>
        <label class="grow">
          {{ $t('encryptDecryptDialog.iV') }}
          <span class="hint">{{ $t('encryptDecryptDialog.hexOrBase64') }}</span>
          <input
            v-model="rawIv"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :placeholder="$t('encryptDecryptDialog.16Bytes32HexOr')"
          />
        </label>
      </div>
      <p class="warn">
        <i18n-t keypath="encryptDecryptDialog.unauthenticatedNote" tag="span">
          <template #word
            ><strong>{{ $t('encryptDecryptDialog.unauthenticated') }}</strong></template
          >
        </i18n-t>
      </p>
    </template>
    <div class="dialog-actions">
      <button
        v-if="keyMode === 'passphrase'"
        class="btn btn-primary"
        :disabled="busy || !input"
        @click="encrypt"
      >
        {{ $t('encryptDecryptDialog.encrypt') }}
      </button>
      <button class="btn btn-primary" :disabled="busy || !input" @click="decrypt">
        {{ $t('encryptDecryptDialog.decrypt') }}
      </button>
    </div>
    <label>
      {{ $t('encryptDecryptDialog.output') }}
      <textarea v-model="output" readonly spellcheck="false"></textarea>
    </label>
    <p v-if="error" class="error">{{ error }}</p>
    <template #actions>
      <button class="btn" :disabled="!output" @click="useOutputAsInput">
        {{ $t('encryptDecryptDialog.useOutputAsInput') }}
      </button>
      <button class="btn" :disabled="!output" @click="copyOutput">
        {{ $t('encryptDecryptDialog.copyOutput') }}
      </button>
      <button class="btn btn-ghost" @click="close">{{ $t('common.close') }}</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/EncryptDecryptDialog.css"></style>
