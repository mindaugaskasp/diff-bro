<script setup>
import { columnName } from '../utils/spreadsheetDiff'
import { cellText, metaAt } from '../utils/sheetCells'

const props = defineProps({
  /** @type {import('vue').PropType<Array<object>>} */
  rows: { type: Array, required: true },
  side: { type: String, required: true }, // 'left' | 'right'
  /** @type {import('vue').PropType<Array<{left: number|null, right: number|null}>>} */
  columns: { type: Array, required: true },
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
// Which of THIS side's columns an aligned column is; null means it has none,
// and the cell renders as a ghost so both grids stay column-for-column aligned.
const colIndex = (col) => (props.side === 'left' ? col.left : col.right)

// A "ghost" (striped gap) on the side with no counterpart keeps both grids aligned.
function rowClass(entry) {
  if (rowData(entry) === null) return 'ghost'
  const hidden = props.hiddenRows.has(rowIndex(entry)) ? ' row-hidden' : ''
  if (entry.status === 'changed') return `changed${hidden}`
  if (entry.status === 'removed' && props.side === 'left') return `removed${hidden}`
  if (entry.status === 'added' && props.side === 'right') return `added${hidden}`
  return hidden.trim()
}

// A column only one side has: a ghost here, marked as added/removed there.
function colClass(col) {
  if (colIndex(col) === null) return 'ghost-col'
  if (col.left === null) return 'col-added'
  if (col.right === null) return 'col-removed'
  return ''
}

function cellClass(entry, col, ci) {
  const i = colIndex(col)
  const m = metaAt(props.meta, rowIndex(entry), i)
  const state = colClass(col)
  return {
    num: typeof rowData(entry)?.[i] === 'number',
    'cell-chg': entry.changed.includes(ci),
    'cell-fchg': entry.formulaChanged.includes(ci),
    'has-f': !!m?.f,
    err: !!m?.e,
    [state]: !!state
  }
}

function text(entry, col) {
  const i = colIndex(col)
  if (i === null) return ''
  return cellText(rowData(entry)?.[i], metaAt(props.meta, rowIndex(entry), i), props.showFormulas)
}
</script>

<template>
  <table class="grid">
    <thead>
      <tr>
        <th class="rownum"></th>
        <th v-for="(col, ci) in columns" :key="ci" :class="colClass(col)" :data-tip="col.name">
          {{ colIndex(col) === null ? '·' : columnName(colIndex(col)) }}
        </th>
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
        <td v-for="(col, ci) in columns" :key="ci" :class="cellClass(entry, col, ci)">
          {{ text(entry, col) }}
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
