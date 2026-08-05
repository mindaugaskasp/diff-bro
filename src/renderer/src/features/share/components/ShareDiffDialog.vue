<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
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

// BaseDialog listens for Escape on WINDOW in the capture phase and stops the
// event, so a handler on the search input never sees it — which is why this
// dialog opts out of that and owns the two-stage Escape itself. Registered in
// capture too, so it runs wherever focus happens to be inside the dialog.
function onEscape(e) {
  if (e.key !== 'Escape' || !recipients.value.length) return
  e.stopPropagation()
  picker.handleKey(e, { onClose: close })
}

onMounted(async () => {
  window.addEventListener('keydown', onEscape, true)
  // Asking for the fingerprint creates this install's keypairs on first use.
  myFingerprint.value = await window.api.myFingerprint()
  await refresh()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onEscape, true))

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
  <BaseDialog
    v-if="recipients.length"
    width="440px"
    :title="$t('share.diffDialog.shareDiff')"
    :escape-closes="false"
    @close="close"
  >
    <form class="dialog-form" @submit.prevent="submit">
      <div class="field-label">{{ $t('share.diffDialog.sealFor') }}</div>
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
          {{ $t('share.diffDialog.emailThisDiff') }}
        </button>
        <button
          type="button"
          :class="
            picker.everyPickedHasEmail.value
              ? $t('shareDiffDialog.btnBtnSm')
              : $t('shareDiffDialog.btnBtnPrimary')
          "
          :disabled="!picker.canSubmit.value"
          @click="saveFile"
        >
          {{ $t('share.diffDialog.createFile') }}
        </button>
        <button
          v-if="picker.canSubmit.value && !picker.everyPickedHasEmail.value"
          type="button"
          class="btn btn-sm"
          @click="share.showTrustedKeysDialog = true"
        >
          {{ $t('share.diffDialog.addAnAddress') }}
        </button>
        <span class="spacer" />
        <button type="button" class="btn btn-ghost" @click="close">
          {{ $t('common.cancel') }}
        </button>
      </div>
    </form>
  </BaseDialog>

  <!-- First-time setup: no trusted keys yet. -->
  <BaseDialog
    v-else
    width="400px"
    :title="$t('share.diffDialog.shareDiffOneTimeSetup')"
    @close="close"
  >
    <p class="dialog-note">
      {{ $t('share.diffDialog.sharedDiffsAreSealedFor') }}
      <code>{{ myFingerprint }}</code
      >); the private half never leaves this machine.
    </p>

    <div class="step">
      <span class="badge">1</span>
      <div class="step-body">
        <strong>{{ $t('share.diffDialog.giveThemYourKey') }}</strong>
        <span class="step-hint">{{ $t('share.diffDialog.nameItAndSendIt') }}</span>
      </div>
      <button type="button" class="btn btn-sm" @click="share.showShareKeyDialog = true">
        {{ $t('share.diffDialog.shareMyKey') }}
      </button>
    </div>

    <div class="step">
      <span class="badge">2</span>
      <div class="step-body">
        <strong>{{ $t('share.diffDialog.addTheirKey') }}</strong>
        <span class="step-hint"
          >{{ $t('share.diffDialog.openThe') }} <code>.diffbrokey</code> file they sent you.</span
        >
      </div>
      <button type="button" class="btn btn-sm btn-primary" @click="share.addTrustedKey()">
        {{ $t('share.diffDialog.addTheirKey2') }}
      </button>
    </div>

    <p class="dialog-note">
      {{ $t('share.diffDialog.asSoonAsTheirKey') }}
    </p>
    <template #actions>
      <button type="button" class="btn btn-ghost" @click="close">{{ $t('common.cancel') }}</button>
    </template>
  </BaseDialog>
</template>
<style scoped src="./styles/ShareDiffDialog.css"></style>
