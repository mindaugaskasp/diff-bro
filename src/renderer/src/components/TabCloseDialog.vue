<script setup>
// Closing a tab is the only way paste-mode text can be lost, so an unsaved
// comparison confirms before it goes. A bulk close asks once and counts, rather
// than stacking one dialog per tab.
import { computed } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useTabsStore } from '../stores/tabsStore'
import { tabLabel } from '../utils/tabs'
import BaseDialog from './BaseDialog.vue'

const diff = useDiffStore()
const tabs = useTabsStore()

const pending = computed(() =>
  (diff.pendingTabClose ?? []).map((id) => tabs.tabs.find((t) => t.id === id)).filter(Boolean)
)
// Only the unsaved ones are at risk — the rest close either way, so naming them
// would overstate what is being decided.
const risky = computed(() => pending.value.filter((t) => tabs.unsaved(t)))
const many = computed(() => risky.value.length > 1)
// The label, not the derived title — a name the reader typed IS its name.
const only = computed(() => (risky.value.length ? tabLabel(risky.value[0]) : 'this comparison'))
</script>

<template>
  <BaseDialog
    :width="many ? '400px' : '340px'"
    :title="many ? 'Close comparisons?' : 'Close comparison?'"
    :closable="false"
    @close="diff.cancelTabClose()"
  >
    <p v-if="many" class="dialog-note">
      Closing {{ pending.length }} comparisons. <strong>{{ risky.length }}</strong> of them haven’t
      been saved, and closing discards them.
    </p>
    <p v-else class="dialog-note">
      <strong>“{{ only }}”</strong> hasn’t been saved. Closing it discards the comparison.
    </p>
    <ul v-if="many" class="risk-list">
      <li v-for="tab in risky" :key="tab.id">{{ tabLabel(tab) }}</li>
    </ul>
    <template #actions>
      <button class="btn btn-destructive" @click="diff.confirmTabClose()">
        {{ many ? 'Close them' : 'Close it' }}
      </button>
      <button class="btn btn-ghost" @click="diff.cancelTabClose()">
        {{ many ? 'Keep them open' : 'Keep it open' }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/TabCloseDialog.css"></style>
