<script setup>
// Which columns name a row. Auto pairs rows by their whole contents, which
// re-sorting an export defeats; naming the key columns pairs them across the
// sheet instead.
import { computed } from 'vue'
import { usePopover } from '../composables/usePopover'
import { columnName } from '../utils/spreadsheetDiff'
import { arrayOfShape } from '../utils/props'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  /** @type {import('vue').PropType<Array<import('../types').AlignedColumn>>} */
  columns: { type: Array, required: true, validator: arrayOfShape('left', 'right', 'name') },
  /** @type {import('vue').PropType<number[]>} */
  keyColumns: { type: Array, required: true },
  duplicateKeys: { type: Number, default: 0 }
})
const emit = defineEmits(['toggle', 'clear'])

const { open, toggle, close, onKeydown, backdrop } = usePopover()

// Only a column both sides have can name a row on both sides.
const rows = computed(() =>
  props.columns
    .map((col, index) => ({ col, index }))
    .filter(({ col }) => col.left !== null && col.right !== null)
    .map(({ col, index }) => ({ index, label: col.name || columnName(col.left) }))
)

defineExpose({ close })
</script>

<template>
  <span class="anchor" @keydown="onKeydown">
    <button
      class="btn btn-sm"
      :class="{ active: open }"
      :aria-expanded="open"
      aria-haspopup="true"
      data-testid="row-match"
      :data-tip="$t('rowMatchMenu.tip')"
      @click="toggle"
    >
      <AppIcon name="fingerprint" />
      {{ $t('rowMatchMenu.matchRows') }}
      <span v-if="keyColumns.length" class="btn-count">{{ keyColumns.length }}</span>
      <AppIcon name="chevron-down" />
    </button>
    <div v-if="open" class="popover" role="group" :aria-label="$t('rowMatchMenu.matchRows')">
      <p class="popover-why lead">
        {{ keyColumns.length ? $t('rowMatchMenu.byKey') : $t('rowMatchMenu.byWholeRow') }}
      </p>
      <div class="key-list">
        <label v-for="row in rows" :key="row.index" class="popover-row">
          <input
            type="checkbox"
            :checked="keyColumns.includes(row.index)"
            @change="emit('toggle', row.index)"
          />
          {{ row.label }}
        </label>
      </div>
      <p v-if="duplicateKeys" class="popover-why">
        {{ $t('rowMatchMenu.duplicates', duplicateKeys) }}
      </p>
      <button
        v-if="keyColumns.length"
        type="button"
        class="popover-row clear"
        @click="emit('clear')"
      >
        {{ $t('rowMatchMenu.useAuto') }}
      </button>
    </div>
  </span>
  <!-- Sibling of the anchor, NOT teleported to body the way the toolbar's menu
       is: `.content` carries `isolation: isolate`, so a body-level backdrop at
       z-index 20 outranks this whole subtree and swallows the clicks meant for
       the panel. The backdrop is `position: fixed`, so it still covers the
       window from here. -->
  <div
    v-if="open"
    class="popover-backdrop"
    @pointerdown="backdrop.onPointerDown"
    @click="backdrop.onClick"
  />
</template>

<style scoped src="./styles/RowMatchMenu.css"></style>
