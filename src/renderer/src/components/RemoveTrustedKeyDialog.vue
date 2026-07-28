<script setup>
// Confirms removing a trusted key. Opens on top of the trusted-keys manager
// (like AddTrustedKeyDialog); the manager re-fetches when this closes.
import { useDiffStore } from '../stores/diffStore'
import BaseDialog from './BaseDialog.vue'

const diff = useDiffStore()

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
  <BaseDialog width="360px" title="Remove trusted key?" :closable="false" @close="cancel">
    <p class="dialog-note">
      Remove <strong>“{{ diff.pendingUntrust.label }}”</strong> from your trusted keys? You won't be
      able to open sealed diffs signed by it, or share to it, until you re-add its
      <code>.diffbrokey</code>.
    </p>
    <template #actions>
      <button class="btn btn-destructive" @click="confirm">Remove</button>
      <button class="btn btn-ghost" @click="cancel">Cancel</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/RemoveTrustedKeyDialog.css"></style>
