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
    <i18n-t keypath="errorReportDialog.intro" tag="p" class="dialog-note">
      <template #local
        ><strong>{{ $t('errorReportDialog.machineOnly') }}</strong></template
      >
    </i18n-t>
    <p v-if="store.lastError" class="err-msg">{{ store.lastError.message }}</p>

    <template #actions>
      <button class="btn" @click="reveal">{{ $t('errorReportDialog.revealLog') }}</button>
      <button class="btn" @click="copyLog">
        {{ copied ? $t('common.copied') : $t('errorReportDialog.copyLog') }}
      </button>
      <button class="btn" @click="report">{{ $t('errorReportDialog.reportOnGitHub') }}</button>
      <button class="btn btn-primary" @click="close">{{ $t('errorReportDialog.dismiss') }}</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/ErrorReportDialog.css"></style>
