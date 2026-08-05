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
function close() {
  share.showShareKeyDialog = false
}
</script>

<template>
  <BaseDialog width="420px" :title="$t('share.keyDialog.shareMyPublicKey')" @close="close">
    <p class="dialog-note">
      {{ $t('share.keyDialog.thisIs') }} <strong>your</strong> public key — hand it to the other
      person so they can receive diffs you share. To receive <em>their</em> diffs, use
      <strong>{{ $t('share.keyDialog.securityAddTrustedKey') }}</strong> on the file
      <em>they</em> send you. You never import your own key.
    </p>

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

    <p v-if="fingerprint" class="fp">
      {{ $t('share.keyDialog.fingerprint') }} <code>{{ fingerprint }}</code>
    </p>

    <template #actions>
      <button class="btn btn-primary" :disabled="busy" @click="save">
        {{ $t('share.keyDialog.saveToFile') }}
      </button>
      <button class="btn" :disabled="busy" @click="copy">
        {{ $t('share.keyDialog.copyToClipboard') }}
      </button>
      <button class="btn btn-ghost" @click="close">{{ $t('common.close') }}</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/ShareKeyDialog.css"></style>
