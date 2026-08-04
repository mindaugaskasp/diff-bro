<script setup>
import { onMounted, ref, watch } from 'vue'
import { useShareStore } from '../shareStore'
import { useRecipientPicker } from '../../../composables/useRecipientPicker'
import BaseDialog from '../../../components/BaseDialog.vue'
import AppIcon from '../../../components/AppIcon.vue'
import RecipientPicker from './RecipientPicker.vue'

// Recipient picker with built-in first-time key-exchange setup (reusing the
// Security-menu flows). Keys are generated automatically on first use.
const share = useShareStore()

const recipients = ref([])
const myFingerprint = ref('')
const picker = useRecipientPicker(recipients)

onMounted(async () => {
  // Asking for the fingerprint creates this install's keypairs on first use.
  myFingerprint.value = await window.api.myFingerprint()
  await refresh()
})

async function refresh(preferFp) {
  recipients.value = await window.api.listTrustedKeys()
  picker.reconcile(preferFp)
}

// Refresh the recipient list once the "Add trusted key" dialog closes.
watch(
  () => share.pendingTrustedKey,
  (val, old) => {
    if (old && !val) refresh(share.lastAddedTrustedFp)
  }
)

const close = () => share.dismissShare()
const saveFile = () => share.shareTo(picker.selected.value)
const emailIt = () => share.emailTo(picker.selected.value, picker.picked.value)
// Enter in the search field reaches here when nothing is ticked; without the
// guard it called shareTo([]).
function submit() {
  if (!picker.canSubmit.value) return
  if (picker.everyPickedHasEmail.value) emailIt()
  else saveFile()
}
</script>

<template>
  <!-- Normal case: at least one trusted recipient exists. -->
  <BaseDialog v-if="recipients.length" width="440px" title="Share diff" @close="close">
    <form class="dialog-form" @submit.prevent="submit">
      <div class="field-label">Seal for</div>
      <RecipientPicker
        :picker="picker"
        show-email
        @submit="submit"
        @close="close"
        @add="share.addTrustedKey()"
      />
      <p class="dialog-note">
        {{
          picker.picked.value.length > 1
            ? `One file only these ${picker.picked.value.length} can open, signed so any modification — including its expiry time — is rejected.`
            : 'The file is encrypted so only the chosen recipient can open it, and signed so any modification — including its expiry time — is rejected.'
        }}
        It expires at the same moment as your local copy.
      </p>
      <div class="dialog-actions">
        <!-- The primary is what the user can actually do now: a disabled primary
             that never explains itself is how a toolbar comes to look switched off. -->
        <button
          v-if="picker.everyPickedHasEmail.value"
          type="button"
          class="btn btn-primary"
          @click="emailIt"
        >
          <AppIcon name="mail" />
          Email this diff
        </button>
        <button
          type="button"
          :class="picker.everyPickedHasEmail.value ? 'btn btn-sm' : 'btn btn-primary'"
          :disabled="!picker.canSubmit.value"
          @click="saveFile"
        >
          Save file
        </button>
        <span class="spacer" />
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
