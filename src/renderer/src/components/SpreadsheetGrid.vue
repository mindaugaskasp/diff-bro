<script setup>
import { columnName } from '../utils/spreadsheetDiff'

const props = defineProps({
  /** @type {import('vue').PropType<Array<object>>} */
  rows: { type: Array, required: true },
  side: { type: String, required: true }, // 'left' | 'right'
  columns: { type: Number, required: true }
})

const rowData = (entry) => (props.side === 'left' ? entry.left : entry.right)
const rowIndex = (entry) => (props.side === 'left' ? entry.leftIndex : entry.rightIndex)

// A "ghost" (striped gap) on the side with no counterpart keeps both grids aligned.
function rowClass(entry) {
  if (rowData(entry) === null) return 'ghost'
  if (entry.status === 'changed') return 'changed'
  if (entry.status === 'removed' && props.side === 'left') return 'removed'
  if (entry.status === 'added' && props.side === 'right') return 'added'
  return ''
}

function cellClass(entry, col) {
  const value = rowData(entry)?.[col]
  const numeric = typeof value === 'number'
  const changed = entry.status === 'changed' && entry.changed.includes(col)
  return { num: numeric, 'cell-chg': changed }
}

function formatCell(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return String(value)
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
      <tr v-for="(entry, r) in rows" :key="r" :class="rowClass(entry)">
        <th class="rownum">{{ rowData(entry) === null ? '·' : rowIndex(entry) + 1 }}</th>
        <td v-for="c in columns" :key="c" :class="cellClass(entry, c - 1)">
          {{ formatCell(rowData(entry)?.[c - 1]) }}
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped src="./styles/SpreadsheetGrid.css"></style>
