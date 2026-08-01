<script setup>
// Closing a tab is the only way paste-mode text can be lost, so an unsaved
// comparison confirms before it goes.
import { computed } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useTabsStore } from '../stores/tabsStore'
import { tabLabel } from '../utils/tabs'
import BaseDialog from './BaseDialog.vue'

const diff = useDiffStore()
const tabs = useTabsStore()
// The label, not the derived title — a name the reader typed IS its name.
const title = computed(() => {
  const tab = tabs.tabs.find((t) => t.id === diff.pendingTabClose)
  return tab ? tabLabel(tab) : 'this comparison'
})
</script>

<template>
  <BaseDialog
    width="340px"
    title="Close comparison?"
    :closable="false"
    @close="diff.cancelTabClose()"
  >
    <p class="dialog-note">
      <strong>“{{ title }}”</strong> hasn’t been saved. Closing it discards the comparison.
    </p>
    <template #actions>
      <button class="btn btn-destructive" @click="diff.confirmTabClose()">Close it</button>
      <button class="btn btn-ghost" @click="diff.cancelTabClose()">Keep it open</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/TabCloseDialog.css"></style>
