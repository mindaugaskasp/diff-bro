<script setup>
import { onMounted, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import BaseDialog from './BaseDialog.vue'

const diff = useDiffStore()
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
    await diff.runExportKey(label.value)
  } finally {
    busy.value = false
  }
}
async function copy() {
  if (busy.value) return
  busy.value = true
  try {
    await diff.runCopyKey(label.value)
  } finally {
    busy.value = false
  }
}
function close() {
  diff.showShareKeyDialog = false
}
</script>

<template>
  <BaseDialog width="420px" title="Share my public key" @close="close">
    <p class="dialog-note">
      This is <strong>your</strong> public key — hand it to the other person so they can receive
      diffs you share. To receive <em>their</em> diffs, use
      <strong>Security → Add Trusted Key</strong> on the file <em>they</em> send you. You never
      import your own key.
    </p>

    <label>
      Name others will see
      <input
        v-model="label"
        type="text"
        spellcheck="false"
        maxlength="80"
        placeholder="e.g. Alice — laptop"
      />
    </label>
    <p class="hint">
      Shown to whoever imports this key, so they recognize it's from you. Not secret, and not part
      of the key's identity.
    </p>

    <p v-if="fingerprint" class="fp">
      Fingerprint: <code>{{ fingerprint }}</code>
    </p>

    <template #actions>
      <button class="btn btn-primary" :disabled="busy" @click="save">Save to file…</button>
      <button class="btn" :disabled="busy" @click="copy">Copy to clipboard</button>
      <button class="btn btn-ghost" @click="close">Close</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/ShareKeyDialog.css"></style>
