<script setup>
import { arrayOfShape } from '../utils/props'
import AppIcon from './AppIcon.vue'
import { t } from '../i18n'

defineProps({
  /** @type {import('vue').PropType<Array<object>>} */
  sheets: { type: Array, required: true, validator: arrayOfShape('name', 'present', 'changes') },
  active: { type: Number, required: true }
})
defineEmits(['select'])

function tipFor(sheet) {
  const hidden = sheet.hidden ? t('sheetTabBar.hiddenSheetPrefix') : ''
  if (sheet.present === 'left') return t('sheetTabBar.onlyInLeft', { prefix: hidden })
  if (sheet.present === 'right') return t('sheetTabBar.onlyInRight', { prefix: hidden })
  const changes = `${sheet.changes} change${sheet.changes === 1 ? '' : 's'}`
  return hidden ? `${hidden}${changes}` : changes
}
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
      :data-tip="tipFor(sheet)"
      @click="$emit('select', i)"
    >
      <AppIcon v-if="sheet.hidden" name="eye-off" class="hidden-mark" />
      <span class="name">{{ sheet.name || '(unnamed)' }}</span>
      <span v-if="sheet.present !== 'both'" class="badge only">{{
        $t('sheetTabBar.onlyIn', { side: sheet.present })
      }}</span>
      <span v-else-if="sheet.changes" class="badge">{{ sheet.changes }}</span>
    </button>
  </div>
</template>

<style scoped src="./styles/SheetTabBar.css"></style>
