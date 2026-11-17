<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useShareStore } from '../shareStore'
import { useRecipientPicker } from '../../../composables/useRecipientPicker'
import BaseDialog from '../../../components/BaseDialog.vue'
import RecipientPicker from './RecipientPicker.vue'
import ShareActions from './ShareActions.vue'
import { useShareNetwork } from '../useShareNetwork'

// Recipient picker with built-in first-time key-exchange setup (reusing the
// Security-menu flows). Keys are generated automatically on first use.
const share = useShareStore()

const recipients = ref([])
const myFingerprint = ref('')
const picker = useRecipientPicker(recipients)
const { network, reachable, networkNote } = useShareNetwork(picker, () => !!share.shareSnippet)

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
    width="452px"
    :title="$t(share.shareSnippet ? 'lan.share.titleSnippet' : 'share.diffDialog.shareDiff')"
    :escape-closes="false"
    @close="close"
  >
    <form class="dialog-form" @submit.prevent="submit">
      <div class="field-label">{{ $t('share.diffDialog.sealFor') }}</div>
      <RecipientPicker
        :picker="picker"
        :reachable="reachable"
        show-email
        @submit="submit"
        @close="close"
        @add="share.addTrustedKey()"
      />
      <p v-if="networkNote" class="dialog-note">{{ $t(networkNote) }}</p>
      <p v-else class="dialog-note">
        {{ $t('share.diffDialog.sealedFor', picker.picked.value.length) }}
        {{ $t('share.diffDialog.sameExpiry') }}
      </p>
      <ShareActions
        :picker="picker"
        :network="network"
        :snippet="!!share.shareSnippet"
        @send="share.sendTo(picker.selected.value)"
        @email="emailIt"
        @file="saveFile"
        @address="share.showTrustedKeysDialog = true"
        @close="close"
      />
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
      <i18n-t keypath="share.diffDialog.sealedIntro" tag="span">
        <template #fp
          ><code>{{ myFingerprint }}</code></template
        >
      </i18n-t>
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
        <span class="step-hint">
          <i18n-t keypath="share.diffDialog.openTheirKey" tag="span">
            <template #ext><code>.diffbrokey</code></template>
          </i18n-t>
        </span>
      </div>
      <button
        type="button"
        class="btn btn-sm"
        :aria-label="$t('keysPanel.addFromClipboardLabel')"
        @click="share.pasteTrustedKey()"
      >
        {{ $t('keysPanel.addFromClipboard') }}
      </button>
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
