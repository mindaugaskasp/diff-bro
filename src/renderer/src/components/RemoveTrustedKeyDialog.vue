<script setup>
// Confirms removing a trusted key. Opens on top of the trusted-keys manager
// (like AddTrustedKeyDialog); the manager re-fetches when this closes.
import { computed } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useVaultStore } from '../stores/vaultStore'
import { ago } from '../utils/relativeTime'
import BaseDialog from './BaseDialog.vue'

const diff = useDiffStore()
const vault = useVaultStore()

// What this key has actually been sent. Removing it does nothing to those —
// they are already on someone else's machine — so the point of showing them is
// that the reader knows their exposure while they decide.
const sent = computed(() => vault.sharedWith(diff.pendingUntrust?.fingerprint ?? ''))

async function confirm() {
  const k = diff.pendingUntrust
  if (k) {
    if (diff.lastAddedTrustedFp === k.fingerprint) diff.lastAddedTrustedFp = null
    await window.api.removeTrusted(k.fingerprint)
  }
  diff.pendingUntrust = null
}
function cancel() {
  diff.pendingUntrust = null
}
</script>

<template>
  <BaseDialog width="420px" title="Remove trusted key?" :closable="false" @close="cancel">
    <p class="dialog-note">
      Remove <strong>“{{ diff.pendingUntrust.label }}”</strong> from your trusted keys? You won't be
      able to open sealed diffs signed by it, or share to it, until you re-add its
      <code>.diffbrokey</code>.
    </p>

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
      <button class="btn btn-destructive" @click="confirm">Remove</button>
      <button class="btn btn-ghost" @click="cancel">Cancel</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/RemoveTrustedKeyDialog.css"></style>
