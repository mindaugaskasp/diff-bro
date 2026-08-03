<script setup>
import { computed, ref, onMounted, watch } from 'vue'
import { useShareStore } from '../shareStore'
import BaseDialog from '../../../components/BaseDialog.vue'

// Recipient picker with built-in first-time key-exchange setup (reusing the
// Security-menu flows). Keys are generated automatically on first use.
const share = useShareStore()

const recipients = ref([])
// A set, not a single pick: one file can be sealed for a whole team.
const selected = ref([])
const myFingerprint = ref('')
const chosen = computed(() =>
  recipients.value.filter((r) => selected.value.includes(r.fingerprint))
)
const toggle = (fp) =>
  (selected.value = selected.value.includes(fp)
    ? selected.value.filter((f) => f !== fp)
    : [...selected.value, fp])

onMounted(async () => {
  // Asking for the fingerprint creates this install's keypairs on first use.
  myFingerprint.value = await window.api.myFingerprint()
  await refresh()
})

async function refresh(preferFp) {
  recipients.value = await window.api.listTrustedKeys()
  const known = recipients.value.map((r) => r.fingerprint)
  selected.value = selected.value.filter((fp) => known.includes(fp))
  // A key added from here is the one you just went to fetch, so it starts ticked.
  if (preferFp && known.includes(preferFp) && !selected.value.includes(preferFp)) {
    selected.value = [...selected.value, preferFp]
  }
  if (!selected.value.length && known.length === 1) selected.value = [known[0]]
}

// Refresh the recipient list once the "Add trusted key" dialog closes.
watch(
  () => share.pendingTrustedKey,
  (val, old) => {
    if (old && !val) refresh(share.lastAddedTrustedFp)
  }
)

function close() {
  share.shareEntryId = null
  share.shareDraft = null
}
</script>

<template>
  <!-- Normal case: at least one trusted recipient exists. -->
  <BaseDialog v-if="recipients.length" width="400px" title="Share diff" @close="close">
    <form class="dialog-form" @submit.prevent="share.shareTo(selected)">
      <div class="field-label">Seal for</div>
      <ul class="recipients">
        <li v-for="r in recipients" :key="r.fingerprint">
          <label class="recipient">
            <input
              type="checkbox"
              :checked="selected.includes(r.fingerprint)"
              @change="toggle(r.fingerprint)"
            />
            <span class="rc-name">{{ r.label }}</span>
            <code class="rc-fp">{{ r.fingerprint.slice(0, 8) }}…</code>
          </label>
        </li>
      </ul>
      <p class="dialog-note">
        {{
          chosen.length > 1
            ? `One file only these ${chosen.length} can open, signed so any modification — including its expiry time — is rejected.`
            : 'The file is encrypted so only the chosen recipient can open it, and signed so any modification — including its expiry time — is rejected.'
        }}
        It expires at the same moment as your local copy.
      </p>
      <div class="dialog-actions">
        <button type="button" class="btn btn-sm" @click="share.addTrustedKey()">
          Add recipient…
        </button>
        <span class="spacer" />
        <button type="submit" class="btn btn-primary" :disabled="!selected.length">
          Create file
        </button>
        <button type="button" class="btn btn-ghost" @click="close">Cancel</button>
      </div>
    </form>
  </BaseDialog>

  <!-- First-time setup: no trusted keys yet. -->
  <BaseDialog v-else width="400px" title="Share diff — one-time setup" @close="close">
    <p class="dialog-note">
      Shared diffs are sealed for named people, so you and your bro first swap public keys — once,
      in both directions. Your keys already exist (created automatically, fingerprint
      <code>{{ myFingerprint }}</code
      >); the private half never leaves this machine.
    </p>

    <div class="step">
      <span class="badge">1</span>
      <div class="step-body">
        <strong>Give them your key</strong>
        <span class="step-hint">Name it and send it — they import it to receive your diffs.</span>
      </div>
      <button type="button" class="btn btn-sm" @click="share.showShareKeyDialog = true">
        Share my key…
      </button>
    </div>

    <div class="step">
      <span class="badge">2</span>
      <div class="step-body">
        <strong>Add their key</strong>
        <span class="step-hint">Open the <code>.diffbrokey</code> file they sent you.</span>
      </div>
      <button type="button" class="btn btn-sm btn-primary" @click="share.addTrustedKey()">
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
