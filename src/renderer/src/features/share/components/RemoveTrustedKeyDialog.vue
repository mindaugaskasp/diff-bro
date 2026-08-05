<script setup>
// Confirms removing a trusted key. Opens on top of the trusted-keys manager
// (like AddTrustedKeyDialog); the manager re-fetches when this closes.
import { computed } from 'vue'
import { useShareStore } from '../shareStore'
import { useVaultStore } from '../../../stores/vaultStore'
import { ago } from '../../../utils/relativeTime'
import BaseDialog from '../../../components/BaseDialog.vue'

const share = useShareStore()
const vault = useVaultStore()

// What this key has actually been sent. Removing it does nothing to those —
// they are already on someone else's machine — so the point of showing them is
// that the reader knows their exposure while they decide.
const sent = computed(() => vault.sharedWith(share.pendingUntrust?.fingerprint ?? ''))

async function confirm() {
  const k = share.pendingUntrust
  if (k) {
    if (share.lastAddedTrustedFp === k.fingerprint) share.lastAddedTrustedFp = null
    await window.api.removeTrusted(k.fingerprint)
  }
  share.pendingUntrust = null
}
function cancel() {
  share.pendingUntrust = null
}
</script>

<template>
  <BaseDialog
    width="420px"
    :title="$t('share.removeTrustedKeyDialog.removeTrustedKey')"
    :closable="false"
    @close="cancel"
  >
    <i18n-t keypath="share.removeTrustedKeyDialog.confirm" tag="p" class="dialog-note">
      <template #name
        ><strong>“{{ share.pendingUntrust.label }}”</strong></template
      >
      <template #ext><code>.diffbrokey</code></template>
    </i18n-t>

    <div v-if="sent.length" class="sent">
      <p class="dialog-note">
        You have sealed {{ sent.length }} {{ sent.length === 1 ? 'diff' : 'diffs' }} for this key.
        Removing it doesn't reach them — they're already on the other machine, and stay readable
        until they expire.
      </p>
      <ul class="sent-list">
        <li v-for="s in sent" :key="`${s.id}-${s.at}`">
          <span class="sent-name">{{ s.name }}</span>
          <span class="sent-when">{{ ago(s.at) }}</span>
        </li>
      </ul>
    </div>

    <template #actions>
      <button class="btn btn-destructive" @click="confirm">{{ $t('common.remove') }}</button>
      <button class="btn btn-ghost" @click="cancel">{{ $t('common.cancel') }}</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/RemoveTrustedKeyDialog.css"></style>
