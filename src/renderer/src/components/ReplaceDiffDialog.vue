<script setup>
// Confirm before overwriting an active UNSAVED comparison (a saved one skips this).
import { computed } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import BaseDialog from './BaseDialog.vue'

const diff = useDiffStore()

const isPick = computed(() => !!diff.pendingPick)
const current = computed(() => `${diff.left?.name ?? '?'} ↔ ${diff.right?.name ?? '?'}`)
const incoming = computed(() => {
  if (diff.pendingPick) return `a new ${diff.pendingPick.side} file`
  return (diff.pendingReplace?.length ?? 0) >= 2 ? 'two new files' : 'a new file'
})

const onCancel = () => (isPick.value ? diff.cancelPick() : diff.cancelReplace())
const onSaveFirst = () => (isPick.value ? diff.saveThenPick() : diff.saveThenReplace())
const onConfirm = () => (isPick.value ? diff.confirmPick() : diff.confirmReplace())
</script>

<template>
  <BaseDialog width="420px" title="Replace current comparison?" @close="onCancel">
    <p class="dialog-note">
      Loading {{ incoming }} will discard the comparison you have open (<code>{{ current }}</code
      >). Save it first if you want to keep it.
    </p>
    <template #actions>
      <button class="btn" @click="onCancel">Cancel</button>
      <span class="spacer" />
      <button class="btn" @click="onSaveFirst">Save first</button>
      <button class="btn btn-destructive" @click="onConfirm">Replace anyway</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/ReplaceDiffDialog.css"></style>
