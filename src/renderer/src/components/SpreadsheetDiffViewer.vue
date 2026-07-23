<script setup>
import { computed, onMounted } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useSpreadsheetDiff } from '../composables/useSpreadsheetDiff'
import { pageRows } from '../utils/spreadsheetDiff'
import SheetTabBar from './SheetTabBar.vue'
import SpreadsheetGrid from './SpreadsheetGrid.vue'
import AppIcon from './AppIcon.vue'

const store = useDiffStore()
const { sheets, active, activeSheet, totals, identical, select } = useSpreadsheetDiff()

// Cap rendered rows so a huge sheet can't freeze the window (no virtualization
// yet — see pageRows).
const view = computed(() => pageRows(activeSheet.value?.rows ?? []))

// The +/− toolbar stat is Monaco line-diff language; the grid owns a richer
// changed/added/removed strip instead, so clear the shared stat while it's up.
onMounted(() => {
  store.stats = null
})
</script>

<template>
  <div class="sheet-viewer">
    <SheetTabBar :sheets="sheets" :active="active" @select="select" />

    <div v-if="identical" class="identical-row">
      <AppIcon name="check" class="ok" />
      <span>No differences — every sheet matches</span>
    </div>

    <div v-if="activeSheet" class="grids">
      <SpreadsheetGrid :rows="view.rows" side="left" :columns="activeSheet.columns" />
      <SpreadsheetGrid :rows="view.rows" side="right" :columns="activeSheet.columns" />
    </div>

    <div class="status band">
      <span v-if="activeSheet && activeSheet.present !== 'both'" class="only">
        “{{ activeSheet.name }}” is only in the {{ activeSheet.present }} file
      </span>
      <template v-else>
        <span class="chg">◆ {{ totals.changed }} changed</span>
        <span class="add">+{{ totals.added }} rows</span>
        <span class="del">−{{ totals.removed }} rows</span>
      </template>
      <span v-if="view.hidden" class="capped">first {{ view.rows.length }} rows shown</span>
      <span class="right">{{ sheets.length }} sheet{{ sheets.length === 1 ? '' : 's' }}</span>
    </div>
  </div>
</template>

<style scoped src="./styles/SpreadsheetDiffViewer.css"></style>
