<script setup>
import { computed, onMounted, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useSpreadsheetDiff } from '../composables/useSpreadsheetDiff'
import { TOLERANCES, TOLERANCE_UNITS } from '../composables/useToleranceChoice'
import { useCaptureRegion } from '../composables/useCaptureRegion'
import { useVirtualRows } from '../composables/useVirtualRows'
import { GRID_ROW_H } from '../utils/virtualRows'
import { zoomedPx } from '../utils/diffZoom'
import { useUiStore } from '../stores/uiStore'
import SheetTabBar from './SheetTabBar.vue'
import SpreadsheetGrid from './SpreadsheetGrid.vue'
import SegmentedControl from './SegmentedControl.vue'
import RowMatchMenu from './RowMatchMenu.vue'
import SpreadsheetStatusBand from './SpreadsheetStatusBand.vue'
import AppIcon from './AppIcon.vue'

const store = useDiffStore()
const {
  sheets,
  active,
  activeSheet,
  totals,
  identical,
  select,
  showFormulas,
  hasFormulas,
  toleranceId,
  customValue,
  customUnit,
  activeKeyColumns,
  toggleKeyColumn,
  clearKeyColumns
} = useSpreadsheetDiff()

const allRows = computed(() => activeSheet.value?.rows ?? [])

// The grids scroll as one box — which is both what an image export
// photographs and what the row window is measured from. One window drives
// BOTH grids, or the two sides would scroll out of alignment.
const grids = ref(null)
useCaptureRegion(grids)
const ui = useUiStore()
const rowH = computed(() => zoomedPx(GRID_ROW_H, ui.diffZoom))
const win = useVirtualRows(grids, () => allRows.value.length, rowH)
const windowed = computed(() => allRows.value.slice(win.value.start, win.value.end))

// Two tables, so :hover in one cannot reach the row aligned with it in the other.
const hoveredRow = ref(-1)

// Clear the Monaco +/− stat; the grid shows its own changed/added/removed strip.
onMounted(() => {
  store.stats = null
})
</script>

<template>
  <div class="sheet-viewer">
    <!-- The grid's own chrome: its tabs on the left, the controls that change
         what the grid SAYS on the right. They sat in the status band until the
         floating shortcut bar grew over them. -->
    <div class="sheet-bar band">
      <SheetTabBar :sheets="sheets" :active="active" @select="select" />
      <div class="grid-tools">
        <SegmentedControl
          v-model:value="toleranceId"
          :label="$t('spreadsheetDiffViewer.tolerance')"
          :options="TOLERANCES"
          :data-tip="$t('spreadsheetDiffViewer.numbersCloserThanThisCount')"
        />
        <!-- Only when asked for, so the band does not grow for the four presets
             that cover the common thresholds. -->
        <template v-if="toleranceId === 'custom'">
          <input
            v-model="customValue"
            class="tol-value"
            type="number"
            min="0"
            step="any"
            inputmode="decimal"
            placeholder="0"
            :aria-label="$t('spreadsheetDiffViewer.customTolerance')"
            :data-tip="$t('spreadsheetDiffViewer.leaveItEmptyToCompare')"
          />
          <SegmentedControl
            v-model:value="customUnit"
            compact
            :label="$t('spreadsheetDiffViewer.unit')"
            :options="TOLERANCE_UNITS"
          />
        </template>
        <RowMatchMenu
          v-if="activeSheet && activeSheet.present === 'both'"
          :columns="activeSheet.columns"
          :key-columns="activeKeyColumns"
          :duplicate-keys="activeSheet.duplicateKeys"
          @toggle="toggleKeyColumn"
          @clear="clearKeyColumns"
        />
        <button
          v-if="hasFormulas"
          class="btn btn-sm"
          :class="{ active: showFormulas }"
          :data-tip="
            showFormulas
              ? $t('spreadsheetDiffViewer.backToTheValues')
              : $t('spreadsheetDiffViewer.showFormulasNotResults')
          "
          @click="showFormulas = !showFormulas"
        >
          <AppIcon name="braces" />
          {{ $t('spreadsheetDiffViewer.formulas') }}
        </button>
        <button
          class="btn btn-sm"
          :data-tip="$t('spreadsheetDiffViewer.saveEveryChangeAsA')"
          :disabled="identical"
          @click="store.exportChangeRegister(sheets)"
        >
          <AppIcon name="table" />
          {{ $t('spreadsheetDiffViewer.register') }}
        </button>
      </div>
    </div>

    <div v-if="identical" class="identical-row">
      <AppIcon name="check" class="ok" />
      <span>{{ $t('spreadsheetDiffViewer.noDifferencesEverySheetMatches') }}</span>
    </div>

    <div
      v-if="activeSheet"
      ref="grids"
      class="grids"
      :style="{ '--grid-row-h': `${rowH}px` }"
      @mouseleave="hoveredRow = -1"
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
        :hovered-row="hoveredRow"
        :pad-top="win.padTop"
        :pad-bottom="win.padBottom"
        @hover="hoveredRow = $event"
      />
    </div>

    <SpreadsheetStatusBand
      :sheet="activeSheet"
      :totals="totals"
      :row-count="allRows.length"
      :sheet-count="sheets.length"
    />
  </div>
</template>

<style scoped src="./styles/SpreadsheetDiffViewer.css"></style>
