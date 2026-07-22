<script setup>
import { computed } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import BaseDialog from './BaseDialog.vue'

const diff = useDiffStore()

const current = computed(() => `${diff.left?.name ?? '?'} ↔ ${diff.right?.name ?? '?'}`)
const dropped = computed(() => {
  const n = diff.pendingReplace?.length ?? 0
  return n >= 2 ? 'two new files' : 'a new file'
})
</script>

<template>
  <BaseDialog width="420px" title="Replace current comparison?" @close="diff.cancelReplace()">
    <p class="dialog-note">
      You dropped {{ dropped }}. Loading it will discard the comparison you have open (<code>{{
        current
      }}</code
      >). Save it first if you want to keep it.
    </p>
    <template #actions>
      <button class="btn btn-ghost" @click="diff.cancelReplace()">Cancel</button>
      <span class="spacer" />
      <button class="btn btn-ghost" @click="diff.saveThenReplace()">Save first</button>
      <button class="btn btn-destructive" @click="diff.confirmReplace()">Replace anyway</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/ReplaceDiffDialog.css"></style>
