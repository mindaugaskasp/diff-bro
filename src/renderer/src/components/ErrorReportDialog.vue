<script setup>
import { ref } from 'vue'
import { useErrorStore } from '../stores/errorStore'
import BaseDialog from './BaseDialog.vue'

const store = useErrorStore()
const copied = ref(false)

function close() {
  store.dismiss()
}

// Copy via the main-process clipboard (navigator.clipboard is blocked).
async function copyLog() {
  const { content } = await window.api.readLog()
  await window.api.copyText(content || '(the log is empty)')
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
function reveal() {
  window.api.revealLog()
}
function report() {
  window.api.reportIssue(store.lastError?.message)
}
</script>

<template>
  <BaseDialog width="460px" :title="$t('errorReportDialog.somethingWentWrong')" @close="close">
    <p class="dialog-note">
      {{ $t('errorReportDialog.diffBroHitAnUnexpected') }}
      <strong>on your machine only</strong> — nothing was sent anywhere. If it keeps happening,
      please report it so it can be fixed: copy the log and paste it into the issue.
    </p>
    <p v-if="store.lastError" class="err-msg">{{ store.lastError.message }}</p>

    <template #actions>
      <button class="btn" @click="reveal">{{ $t('errorReportDialog.revealLog') }}</button>
      <button class="btn" @click="copyLog">{{ copied ? 'Copied' : 'Copy log' }}</button>
      <button class="btn" @click="report">{{ $t('errorReportDialog.reportOnGitHub') }}</button>
      <button class="btn btn-primary" @click="close">{{ $t('errorReportDialog.dismiss') }}</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/ErrorReportDialog.css"></style>
