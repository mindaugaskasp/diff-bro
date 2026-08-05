<script setup>
import { computed, onMounted, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { TOLERANCES, TOLERANCE_UNITS, useSpreadsheetDiff } from '../composables/useSpreadsheetDiff'
import { useCaptureRegion } from '../composables/useCaptureRegion'
import { useVirtualRows } from '../composables/useVirtualRows'
import { GRID_ROW_H } from '../utils/virtualRows'
import SheetTabBar from './SheetTabBar.vue'
import SpreadsheetGrid from './SpreadsheetGrid.vue'
import SegmentedControl from './SegmentedControl.vue'
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
  customUnit
} = useSpreadsheetDiff()

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

    <div class="status-band">
      <span v-if="activeSheet && activeSheet.present !== 'both'" class="only">
        {{
          $t('spreadsheetDiffViewer.sheetOnlyIn', {
            name: activeSheet.name,
            side: activeSheet.present
          })
        }}
      </span>
      <template v-else>
        <span>
          {{ $t('spreadsheetDiffViewer.cells') }}
          <span class="chg cells">{{ $t('count.changed', totals.changed) }}</span>
        </span>
        <span>
          {{ $t('spreadsheetDiffViewer.rows') }}
          <span class="add">{{ $t('count.added', totals.added) }}</span> ·
          <span class="del">{{ $t('count.removed', totals.removed) }}</span>
        </span>
        <span v-if="totals.columns">
          {{ $t('spreadsheetDiffViewer.columns') }}
          <span class="chg cols">{{ totals.columns }} moved</span>
        </span>
      </template>
      <span class="band-end">
        <span>{{ $t('count.rows', allRows.length) }}</span>
        <span>{{ sheets.length }} sheet{{ sheets.length === 1 ? '' : 's' }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped src="./styles/SpreadsheetDiffViewer.css"></style>
