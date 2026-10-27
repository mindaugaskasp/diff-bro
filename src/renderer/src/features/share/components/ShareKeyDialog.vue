<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useShareStore } from '../shareStore'
import { useKeyName } from '../useKeyName'
import { takenBy } from '../../../../../shared/keyName'
import BaseDialog from '../../../components/BaseDialog.vue'
import KeyNameHint from './KeyNameHint.vue'

const share = useShareStore()
const label = ref('')
const fingerprint = ref('')
const busy = ref(false)
const nameInput = ref(null)
const { problem, count, message } = useKeyName(label)
const blocked = computed(() => busy.value || !!problem.value)
const contact = computed(() => takenBy(share.trusted, label.value, null))

onMounted(async () => {
  nameInput.value?.focus()
  share.refreshTrusted()
  // Prefill the prior name and show the fingerprint for out-of-band verification.
  label.value = (await window.api.myKeyLabel()) ?? ''
  fingerprint.value = (await window.api.myFingerprint()) ?? ''
  await nextTick()
  nameInput.value?.select()
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
        ref="nameInput"
        v-model="label"
        type="text"
        spellcheck="false"
        :placeholder="$t('share.keyDialog.eGAliceLaptop')"
      />
    </label>
    <KeyNameHint :count="count" :message="message" />
    <p v-if="contact" class="hint">{{ $t('keyName.alsoAContact', { name: contact.label }) }}</p>
    <p class="hint">
      {{ $t('share.keyDialog.shownToWhoeverImportsThis') }}
    </p>

    <i18n-t v-if="fingerprint" keypath="share.keyDialog.fingerprint" tag="p" class="fp">
      <template #fp
        ><code>{{ fingerprint }}</code></template
      >
    </i18n-t>

    <template #actions>
      <button class="btn btn-primary" :disabled="blocked" @click="save">
        {{ $t('share.keyDialog.saveToFile') }}
      </button>
      <button class="btn" :disabled="blocked" @click="copy">
        {{ $t('share.keyDialog.copyToClipboard') }}
      </button>
      <button
        class="btn"
        :disabled="blocked"
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
