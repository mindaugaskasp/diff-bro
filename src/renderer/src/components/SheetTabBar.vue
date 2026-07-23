<script setup>
import { arrayOfShape } from '../utils/props'

defineProps({
  /** @type {import('vue').PropType<Array<object>>} */
  sheets: { type: Array, required: true, validator: arrayOfShape('name', 'present', 'changes') },
  active: { type: Number, required: true }
})
defineEmits(['select'])
</script>

<template>
  <div class="sheet-tabs band" role="tablist">
    <button
      v-for="(sheet, i) in sheets"
      :key="sheet.name"
      class="tab"
      :class="{ active: i === active, missing: sheet.present !== 'both' }"
      role="tab"
      :aria-selected="i === active"
      :title="
        sheet.present === 'left'
          ? 'Only in the left file'
          : sheet.present === 'right'
            ? 'Only in the right file'
            : `${sheet.changes} change${sheet.changes === 1 ? '' : 's'}`
      "
      @click="$emit('select', i)"
    >
      <span class="name">{{ sheet.name || '(unnamed)' }}</span>
      <span v-if="sheet.present !== 'both'" class="badge only">only {{ sheet.present }}</span>
      <span v-else-if="sheet.changes" class="badge">{{ sheet.changes }}</span>
    </button>
  </div>
</template>

<style scoped src="./styles/SheetTabBar.css"></style>
