<script setup>
import { computed, onMounted, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useSpreadsheetDiff } from '../composables/useSpreadsheetDiff'
import { useCaptureRegion } from '../composables/useCaptureRegion'
import { useVirtualRows } from '../composables/useVirtualRows'
import { GRID_ROW_H } from '../utils/virtualRows'
import SheetTabBar from './SheetTabBar.vue'
import SpreadsheetGrid from './SpreadsheetGrid.vue'
import AppIcon from './AppIcon.vue'

const store = useDiffStore()
const { sheets, active, activeSheet, totals, identical, select, showFormulas, hasFormulas } =
  useSpreadsheetDiff()

const allRows = computed(() => activeSheet.value?.rows ?? [])

// The grids scroll as one box — which is both what an image export
// photographs and what the row window is measured from. One window drives
// BOTH grids, or the two sides would scroll out of alignment.
const grids = ref(null)
useCaptureRegion(grids)
const win = useVirtualRows(grids, () => allRows.value.length, GRID_ROW_H)
const windowed = computed(() => allRows.value.slice(win.value.start, win.value.end))

// Clear the Monaco +/− stat; the grid shows its own changed/added/removed strip.
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

    <div
      v-if="activeSheet"
      ref="grids"
      class="grids"
      :style="{ '--grid-row-h': `${GRID_ROW_H}px` }"
    >
      <SpreadsheetGrid
        v-for="side in ['left', 'right']"
        :key="side"
        :rows="windowed"
        :side="side"
        :columns="activeSheet.columns"
        :meta="side === 'left' ? activeSheet.leftMeta : activeSheet.rightMeta"
        :hidden-rows="side === 'left' ? activeSheet.leftHidden : activeSheet.rightHidden"
        :show-formulas="showFormulas"
        :pad-top="win.padTop"
        :pad-bottom="win.padBottom"
      />
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
      <span class="capped">{{ allRows.length }} rows</span>
      <!-- Right-hand group: the floating shortcut bar sits over the middle of
           this band, and a control there would be unclickable. -->
      <span class="right">
        <button
          v-if="hasFormulas"
          class="btn btn-sm"
          :class="{ active: showFormulas }"
          :data-tip="
            showFormulas ? 'Back to the values each formula produced' : 'Show formulas, not results'
          "
          @click="showFormulas = !showFormulas"
        >
          <AppIcon name="braces" />
          Formulas
        </button>
        <span>{{ sheets.length }} sheet{{ sheets.length === 1 ? '' : 's' }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped src="./styles/SpreadsheetDiffViewer.css"></style>
