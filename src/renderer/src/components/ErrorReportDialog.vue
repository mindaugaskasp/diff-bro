<script setup>
import { ref } from 'vue'
import { useErrorStore } from '../stores/errorStore'
import BaseDialog from './BaseDialog.vue'

const store = useErrorStore()
const copied = ref(false)

function close() {
  store.dismiss()
}

// Copy today's log through the main-process clipboard (navigator.clipboard is
// blocked by the deny-all permission handler — see clipboard.js).
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
  window.api.reportIssue()
}
</script>

<template>
  <BaseDialog width="460px" title="Something went wrong" @close="close">
    <p class="dialog-note">
      Diff Bro hit an unexpected error. It's been written to a log
      <strong>on your machine only</strong> — nothing was sent anywhere. If it keeps happening,
      please report it so it can be fixed: copy the log and paste it into the issue.
    </p>
    <p v-if="store.lastError" class="err-msg">{{ store.lastError.message }}</p>

    <template #actions>
      <button class="btn btn-ghost" @click="reveal">Reveal log</button>
      <button class="btn btn-ghost" @click="copyLog">{{ copied ? 'Copied' : 'Copy log' }}</button>
      <button class="btn btn-ghost" @click="report">Report on GitHub</button>
      <button class="btn btn-primary" @click="close">Dismiss</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/ErrorReportDialog.css"></style>
