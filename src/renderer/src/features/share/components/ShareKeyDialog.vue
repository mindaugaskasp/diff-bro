<script setup>
import { onMounted, ref } from 'vue'
import { useShareStore } from '../shareStore'
import BaseDialog from '../../../components/BaseDialog.vue'

const share = useShareStore()
const label = ref('')
const fingerprint = ref('')
const busy = ref(false)

onMounted(async () => {
  // Prefill the prior name and show the fingerprint for out-of-band verification.
  label.value = (await window.api.myKeyLabel()) ?? ''
  fingerprint.value = (await window.api.myFingerprint()) ?? ''
})

async function save() {
  if (busy.value) return
  busy.value = true
  try {
    await share.runExportKey(label.value)
  } finally {
    busy.value = false
  }
}
async function copy() {
  if (busy.value) return
  busy.value = true
  try {
    await share.runCopyKey(label.value)
  } finally {
    busy.value = false
  }
}
async function email() {
  if (busy.value) return
  busy.value = true
  try {
    await share.runEmailKey(label.value)
  } finally {
    busy.value = false
  }
}
function close() {
  share.showShareKeyDialog = false
}
</script>

<template>
  <BaseDialog width="420px" :title="$t('share.keyDialog.shareMyPublicKey')" @close="close">
    <i18n-t keypath="share.keyDialog.intro" tag="p" class="dialog-note">
      <template #your
        ><strong>{{ $t('share.keyDialog.your') }}</strong></template
      >
      <template #their
        ><em>{{ $t('share.keyDialog.their') }}</em></template
      >
      <template #menu
        ><strong>{{ $t('share.keyDialog.securityAddTrustedKey') }}</strong></template
      >
      <template #they
        ><em>{{ $t('share.keyDialog.they') }}</em></template
      >
    </i18n-t>

    <label>
      {{ $t('share.keyDialog.nameOthersWillSee') }}
      <input
        v-model="label"
        type="text"
        spellcheck="false"
        maxlength="80"
        :placeholder="$t('share.keyDialog.eGAliceLaptop')"
      />
    </label>
    <p class="hint">
      {{ $t('share.keyDialog.shownToWhoeverImportsThis') }}
    </p>

    <i18n-t v-if="fingerprint" keypath="share.keyDialog.fingerprint" tag="p" class="fp">
      <template #fp
        ><code>{{ fingerprint }}</code></template
      >
    </i18n-t>

    <template #actions>
      <button class="btn btn-primary" :disabled="busy" @click="save">
        {{ $t('share.keyDialog.saveToFile') }}
      </button>
      <button class="btn" :disabled="busy" @click="copy">
        {{ $t('share.keyDialog.copyToClipboard') }}
      </button>
      <button
        class="btn"
        :disabled="busy"
        :data-tip="$t('share.keyDialog.emailItTip')"
        @click="email"
      >
        {{ $t('share.keyDialog.emailIt') }}
      </button>
      <button class="btn btn-ghost" @click="close">{{ $t('common.close') }}</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/ShareKeyDialog.css"></style>
