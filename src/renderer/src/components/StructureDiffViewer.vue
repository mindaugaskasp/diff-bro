<script setup>
// The structure-aware view: one tree of the two documents merged, each row
// marked with what happened to it. Rows carry their own depth, so this renders
// a flat list rather than nesting components (see utils/structuralDiff).
import { computed, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useCaptureRegion } from '../composables/useCaptureRegion'
import { useVirtualRows } from '../composables/useVirtualRows'
import { SD_ROW_H } from '../utils/virtualRows'
import { visibleStructureRows } from '../utils/structuralDiff'
import AppIcon from './AppIcon.vue'

const store = useDiffStore()

const result = computed(() => store.structureDiff)
const identical = computed(() => {
  const s = result.value?.stats
  return !!s && s.added === 0 && s.removed === 0 && s.changed === 0
})
// Unchanged rows are the bulk of a config file and say nothing, so they collapse
// away unless the reader asks for the whole document.
const shown = computed(() => visibleStructureRows(result.value?.rows ?? [], store.structureShowAll))
const rows = ref(null)
useCaptureRegion(rows)
// Only the visible slice reaches the DOM; the spacers hold the scroll height.
// Rows are a fixed height by CSS, which is what makes the arithmetic exact.
const win = useVirtualRows(rows, () => shown.value.length, SD_ROW_H)
const windowed = computed(() => shown.value.slice(win.value.start, win.value.end))

const MARK = { added: '+', removed: '−', changed: '~', same: '' }
const retyped = (row) => row.status === 'changed' && row.leftType !== row.rightType
</script>

<template>
  <div class="structure-diff">
    <div v-if="identical" class="identical-row">
      <AppIcon name="check" class="ok" />
      <span>No differences — the two documents hold the same data</span>
    </div>

    <div v-else-if="!result" class="sd-empty">
      This comparison can no longer be read as {{ store.structuredFormat ?? 'structured data' }}.
    </div>

    <div
      v-else
      ref="rows"
      class="sd-rows"
      role="list"
      aria-label="Structural differences"
      :style="{ '--sd-row-h': `${SD_ROW_H}px` }"
    >
      <div class="sd-pad" :style="{ height: `${win.padTop}px` }"></div>
      <div
        v-for="row in windowed"
        :key="row.path"
        class="sd-row"
        :class="row.status"
        role="listitem"
        :style="{ '--indent': row.depth }"
      >
        <span class="sd-mark" aria-hidden="true">{{ MARK[row.status] }}</span>
        <span class="sd-key">{{ row.label }}</span>
        <template v-if="!row.container">
          <span v-if="row.left !== undefined" class="sd-val old">{{ row.left }}</span>
          <span v-if="row.status === 'changed'" class="sd-arrow" aria-hidden="true">→</span>
          <span v-if="row.right !== undefined && row.status !== 'same'" class="sd-val new">{{
            row.right
          }}</span>
          <span v-if="retyped(row)" class="sd-type">{{ row.leftType }} → {{ row.rightType }}</span>
        </template>
      </div>
      <div class="sd-pad" :style="{ height: `${win.padBottom}px` }"></div>
    </div>

    <div class="status-band">
      <span>
        Keys <span class="add">{{ result?.stats.added ?? 0 }} added</span> ·
        <span class="chg">{{ result?.stats.changed ?? 0 }} changed</span> ·
        <span class="del">{{ result?.stats.removed ?? 0 }} removed</span>
      </span>
      <span v-if="result?.hidden" class="capped">first {{ result.rows.length }} rows shown</span>
      <span>{{ shown.length }} rows</span>
      <span class="band-end">
        <label class="sd-all">
          <input v-model="store.structureShowAll" type="checkbox" />
          Show unchanged
        </label>
      </span>
    </div>
  </div>
</template>

<style scoped src="./styles/StructureDiffViewer.css"></style>
