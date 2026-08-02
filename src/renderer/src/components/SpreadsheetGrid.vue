<script setup>
import { columnName } from '../utils/spreadsheetDiff'
import { cellText, metaAt } from '../utils/sheetCells'

const props = defineProps({
  /** @type {import('vue').PropType<Array<object>>} */
  rows: { type: Array, required: true },
  side: { type: String, required: true }, // 'left' | 'right'
  columns: { type: Number, required: true },
  /** @type {import('vue').PropType<Map<number, import('../types').CellMeta>>} */
  meta: { type: Map, required: true },
  /** @type {import('vue').PropType<Set<number>>} */
  hiddenRows: { type: Set, required: true },
  showFormulas: { type: Boolean, default: false },
  // The rows above and below the window, as height. The list is virtualized;
  // these keep the scrollbar measuring the whole sheet.
  padTop: { type: Number, default: 0 },
  padBottom: { type: Number, default: 0 }
})

const rowData = (entry) => (props.side === 'left' ? entry.left : entry.right)
const rowIndex = (entry) => (props.side === 'left' ? entry.leftIndex : entry.rightIndex)
const metaOf = (entry, col) => metaAt(props.meta, rowIndex(entry), col)

// A "ghost" (striped gap) on the side with no counterpart keeps both grids aligned.
function rowClass(entry) {
  if (rowData(entry) === null) return 'ghost'
  const hidden = props.hiddenRows.has(rowIndex(entry)) ? ' row-hidden' : ''
  if (entry.status === 'changed') return `changed${hidden}`
  if (entry.status === 'removed' && props.side === 'left') return `removed${hidden}`
  if (entry.status === 'added' && props.side === 'right') return `added${hidden}`
  return hidden.trim()
}

function cellClass(entry, col) {
  const m = metaOf(entry, col)
  return {
    num: typeof rowData(entry)?.[col] === 'number',
    'cell-chg': entry.changed.includes(col),
    'cell-fchg': entry.formulaChanged.includes(col),
    'has-f': !!m?.f,
    err: !!m?.e
  }
}

function text(entry, col) {
  return cellText(rowData(entry)?.[col], metaOf(entry, col), props.showFormulas)
}
</script>

<template>
  <table class="grid">
    <thead>
      <tr>
        <th class="rownum"></th>
        <th v-for="c in columns" :key="c">{{ columnName(c - 1) }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-if="padTop" class="pad" :style="{ height: `${padTop}px` }" aria-hidden="true"></tr>
      <tr v-for="(entry, r) in rows" :key="r" :class="rowClass(entry)">
        <th
          class="rownum"
          :data-tip="hiddenRows.has(rowIndex(entry)) ? 'Hidden in the source file' : null"
        >
          {{ rowData(entry) === null ? '·' : rowIndex(entry) + 1 }}
        </th>
        <td v-for="c in columns" :key="c" :class="cellClass(entry, c - 1)">
          {{ text(entry, c - 1) }}
        </td>
      </tr>
      <tr
        v-if="padBottom"
        class="pad"
        :style="{ height: `${padBottom}px` }"
        aria-hidden="true"
      ></tr>
    </tbody>
  </table>
</template>

<style scoped src="./styles/SpreadsheetGrid.css"></style>
