<script setup>
import { computed } from 'vue'
import { shaped } from '../utils/props'

const props = defineProps({
  /** @type {import('vue').PropType<object|null>} the active sheet's diff */
  sheet: {
    type: Object,
    default: null,
    validator: (v) => v === null || shaped('name', 'present', 'headerRows')(v)
  },
  /** @type {import('vue').PropType<{changed:number,added:number,removed:number,columns:number}>} */
  totals: {
    type: Object,
    required: true,
    validator: shaped('changed', 'added', 'removed', 'columns')
  },
  rowCount: { type: Number, required: true },
  sheetCount: { type: Number, required: true }
})

// Only worth saying when the headers were NOT row 1 — otherwise it is chrome
// restating the obvious. One-based, because that is what the grid's gutter shows.
const headerNote = computed(() => {
  const at = props.sheet?.headerRows
  if (!at || (at.left === 0 && at.right === 0)) return null
  return { left: at.left + 1, right: at.right + 1 }
})
</script>

<template>
  <div class="status-band">
    <span v-if="sheet && sheet.present !== 'both'" class="only">
      {{ $t('spreadsheetDiffViewer.sheetOnlyIn', { name: sheet.name, side: sheet.present }) }}
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
        <span class="chg cols">{{ $t('count.moved', totals.columns) }}</span>
      </span>
    </template>
    <span class="band-end">
      <span v-if="headerNote">
        {{
          headerNote.left === headerNote.right
            ? $t('spreadsheetDiffViewer.headerRow', { row: headerNote.left })
            : $t('spreadsheetDiffViewer.headerRowEachSide', headerNote)
        }}
      </span>
      <span>{{ $t('count.rows', rowCount) }}</span>
      <span>{{ $t('count.sheets', sheetCount) }}</span>
    </span>
  </div>
</template>
