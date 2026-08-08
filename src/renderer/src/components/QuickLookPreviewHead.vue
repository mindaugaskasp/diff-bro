<script setup>
// The preview pane's title band: back-out, name, language chip and the row's two
// actions. Its own component so QuickLook.vue's template stays within its cap.
import AppIcon from './AppIcon.vue'
import { shaped } from '../utils/props'

defineProps({
  current: { type: Object, required: true, validator: shaped({ kind: 'string', name: 'string' }) },
  copied: { type: Boolean, default: false },
  copyKey: { type: String, required: true },
  canEdit: { type: Boolean, default: false }
})
const zone = defineModel('zone', { type: String, required: true })
defineEmits(['copy', 'edit'])
</script>

<template>
  <div class="ql-pv-head band">
    <button
      v-if="zone === 'preview'"
      class="btn btn-icon ql-pv-back"
      :data-tip="$t('quickLookPreviewHead.backToTheResultsList')"
      :aria-label="$t('quickLookPreviewHead.backToList')"
      @click="zone = 'list'"
    >
      <AppIcon name="chevron-left" />
    </button>
    <span class="ql-pv-name">{{ current.name }}</span>
    <span v-if="current.lang" class="ql-pv-lang">{{ current.lang }}</span>
    <button
      v-if="canEdit"
      class="btn btn-sm ql-pv-copy"
      :data-tip="$t('quickLookPreviewHead.editThisSnippetWithoutLeaving')"
      @click="$emit('edit')"
    >
      <AppIcon name="edit" /> {{ $t('quickLookPreviewHead.edit') }}
    </button>
    <button
      v-if="current.kind === 'snippet'"
      class="btn btn-sm ql-pv-copy"
      :data-tip="$t('quickLookPreviewHead.copyContentsTip', { key: copyKey })"
      @click="$emit('copy')"
    >
      <AppIcon :name="copied ? 'check' : 'copy'" />
      {{ copied ? $t('common.copied') : $t('common.copy') }}
    </button>
  </div>
</template>

<style scoped src="./styles/QuickLookPreviewHead.css"></style>
