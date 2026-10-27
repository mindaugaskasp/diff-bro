<script setup>
import { onMounted, ref } from 'vue'
import { useShareStore } from '../shareStore'
import { useKeyName } from '../useKeyName'
import { distinctKeyName, normalizeKeyName, takenBy } from '../../../../../shared/keyName'
import BaseDialog from '../../../components/BaseDialog.vue'
import KeyNameHint from './KeyNameHint.vue'

const share = useShareStore()
const label = ref(share.pendingTrustedKey?.label ?? '')
const renamedFrom = ref('')
const renamedTo = ref('')
const fingerprint = () => share.pendingTrustedKey?.fingerprint ?? null
const { problem, count, message } = useKeyName(label, {
  trusted: () => share.trusted,
  fingerprint
})

// A name another contact already wears is swapped for a numbered one up front,
// so the list never holds two keys the reader cannot tell apart.
onMounted(async () => {
  await share.refreshTrusted()
  const offered = normalizeKeyName(label.value)
  if (offered && takenBy(share.trusted, offered, fingerprint())) {
    renamedFrom.value = offered
    label.value = distinctKeyName(offered, share.trusted, fingerprint())
    renamedTo.value = label.value
  }
})
// Guard against a second submit while the key is still being stored.
const adding = ref(false)

async function add() {
  if (adding.value) return
  adding.value = true
  await share.confirmTrustedKey(label.value)
}
// The clipboard offer declined — back to the picker, with the peek skipped so
// the same clipboard cannot re-offer itself.
function chooseFileInstead() {
  share.pendingTrustedKey = null
  share.addTrustedKey({ skipPeek: true })
}
</script>

<template>
  <BaseDialog
    width="360px"
    :title="$t('share.addTrustedKeyDialog.addTrustedKey')"
    @close="share.cancelTrustedKey()"
  >
    <form class="dialog-form" @submit.prevent="add">
      <i18n-t keypath="share.addTrustedKeyDialog.intro" tag="p" class="dialog-note">
        <template #whose>
          <strong>{{ $t('share.addTrustedKeyDialog.someoneElses') }}</strong>
        </template>
        <template #fp
          ><code>{{ share.pendingTrustedKey?.fingerprint }}</code></template
        >
      </i18n-t>
      <i18n-t
        v-if="share.pendingTrustedKey?.vouchedBy"
        keypath="share.addTrustedKeyDialog.vouch"
        tag="p"
        class="dialog-note vouch"
      >
        <template #who
          ><strong>{{ share.pendingTrustedKey.vouchedBy }}</strong></template
        >
      </i18n-t>
      <p v-if="share.pendingTrustedKey?.source === 'clipboard'" class="dialog-note clip-source">
        {{ $t('share.addTrustedKeyDialog.fromYourClipboard') }}
        <button type="button" class="btn btn-sm" @click="chooseFileInstead">
          {{ $t('share.addTrustedKeyDialog.chooseAFileInstead') }}
        </button>
      </p>
      <label>
        {{ $t('share.addTrustedKeyDialog.name') }}
        <input
          v-model="label"
          type="text"
          spellcheck="false"
          :placeholder="$t('share.addTrustedKeyDialog.eGAliceLaptop')"
          autofocus
        />
      </label>
      <p v-if="renamedFrom" class="dialog-note">
        {{ $t('keyName.renamedOnImport', { name: renamedFrom, suggested: renamedTo }) }}
      </p>
      <KeyNameHint :count="count" :message="message" />
      <div class="dialog-actions">
        <button type="submit" class="btn btn-primary" :disabled="!!problem || adding">
          {{ adding ? $t('addTrustedKeyDialog.adding') : $t('addTrustedKeyDialog.add') }}
        </button>
        <button type="button" class="btn btn-ghost" @click="share.cancelTrustedKey()">
          {{ $t('common.cancel') }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>

<style scoped src="./styles/AddTrustedKeyDialog.css"></style>
