<script setup>
import { computed, ref, onMounted, watch } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import BaseDialog from './BaseDialog.vue'

// Recipient picker with built-in first-time key-exchange setup (reusing the
// Security-menu flows). Keys are generated automatically on first use.
const diff = useDiffStore()

const recipients = ref([])
const selected = ref(null)
const selectedFingerprint = computed(() => selected.value)
const myFingerprint = ref('')

onMounted(async () => {
  // Asking for the fingerprint creates this install's keypairs on first use.
  myFingerprint.value = await window.api.myFingerprint()
  await refresh()
})

async function refresh(preferFp) {
  recipients.value = await window.api.listTrustedKeys()
  selected.value =
    preferFp ?? selected.value ?? recipients.value[recipients.value.length - 1]?.fingerprint ?? null
}

// Refresh the recipient list once the "Add trusted key" dialog closes.
watch(
  () => diff.pendingTrustedKey,
  (val, old) => {
    if (old && !val) refresh()
  }
)

function close() {
  diff.shareEntryId = null
  diff.shareDraft = null
}
</script>

<template>
  <!-- Normal case: at least one trusted recipient exists. -->
  <BaseDialog v-if="recipients.length" width="400px" title="Share diff" @close="close">
    <form class="dialog-form" @submit.prevent="diff.shareTo(selected)">
      <label>
        Seal for recipient
        <select v-model="selected">
          <option v-for="r in recipients" :key="r.fingerprint" :value="r.fingerprint">
            {{ r.label }} · {{ r.fingerprint.slice(0, 8) }}…
          </option>
        </select>
      </label>
      <p v-if="selectedFingerprint" class="fp-hint">Fingerprint: {{ selectedFingerprint }}</p>
      <p class="dialog-note">
        The file is encrypted so only this recipient can open it, and signed so any modification —
        including its expiry time — is rejected. It expires at the same moment as your local copy.
      </p>
      <div class="dialog-actions">
        <button type="button" class="btn btn-sm btn-ghost" @click="diff.addTrustedKey()">
          Add recipient…
        </button>
        <span class="spacer" />
        <button type="submit" class="btn btn-primary" :disabled="!selected">Create file</button>
        <button type="button" class="btn btn-ghost" @click="close">Cancel</button>
      </div>
    </form>
  </BaseDialog>

  <!-- First-time setup: no trusted keys yet. -->
  <BaseDialog v-else width="400px" title="Share diff — one-time setup" @close="close">
    <p class="dialog-note">
      Shared diffs are sealed for one specific person, so you and your bro first swap public keys —
      once, in both directions. Your keys already exist (created automatically, fingerprint
      <code>{{ myFingerprint }}</code
      >); the private half never leaves this machine.
    </p>

    <div class="step">
      <span class="badge">1</span>
      <div class="step-body">
        <strong>Give them your key</strong>
        <span class="step-hint">Name it and send it — they import it to receive your diffs.</span>
      </div>
      <button type="button" class="btn btn-sm btn-ghost" @click="diff.showShareKeyDialog = true">
        Share my key…
      </button>
    </div>

    <div class="step">
      <span class="badge">2</span>
      <div class="step-body">
        <strong>Add their key</strong>
        <span class="step-hint">Open the <code>.diffbrokey</code> file they sent you.</span>
      </div>
      <button type="button" class="btn btn-sm btn-primary" @click="diff.addTrustedKey()">
        Add their key…
      </button>
    </div>

    <p class="dialog-note">
      As soon as their key is added you can pick them as a recipient — this dialog updates
      automatically.
    </p>
    <template #actions>
      <button type="button" class="btn btn-ghost" @click="close">Cancel</button>
    </template>
  </BaseDialog>
</template>
<style scoped src="./styles/ShareDiffDialog.css"></style>
