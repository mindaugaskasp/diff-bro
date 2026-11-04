<script setup>
import AppIcon from '../../../components/AppIcon.vue'
import { shaped } from '../../../utils/props'

defineProps({
  /** @type {import('vue').PropType<import('../../../types').TourRow>} */
  row: { type: Object, required: true, validator: shaped('id', 'nameKey', 'summaryKey') },
  disabled: { type: Boolean, default: false }
})
defineEmits(['take'])
</script>

<template>
  <div class="tour-row" :data-tour-row="row.id">
    <span class="glyph-well" :data-hue="row.hue"><AppIcon :name="row.icon" /></span>
    <span class="tr-text">
      <span class="tr-name">{{ $t(row.nameKey) }}</span>
      <span class="tr-summary">{{ $t(row.summaryKey, { count: row.steps }) }}</span>
    </span>
    <span v-if="row.isNew" class="new-badge">{{ $t('settingsTours.new') }}</span>
    <span v-else-if="row.done" class="tr-state">{{ $t('settingsTours.done') }}</span>
    <button type="button" class="btn btn-sm" :disabled="disabled" @click="$emit('take', row.id)">
      {{ row.done ? $t('settingsTours.replay') : $t('settingsTours.start') }}
    </button>
  </div>
</template>

<style scoped src="./styles/TourRow.css"></style>
