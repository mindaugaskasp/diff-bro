<script setup>
import BaseDialog from './BaseDialog.vue'
import { MOD } from '../keys'

defineProps({ name: { type: String, default: '' } })
const emit = defineEmits(['confirm', 'cancel'])
</script>

<template>
  <BaseDialog width="420px" :title="$t('snippetDocument.formatTitle')" @close="emit('cancel')">
    <p class="dialog-note">{{ $t('snippetDocument.formatNote', { name, undo: `${MOD}+Z` }) }}</p>
    <template #actions>
      <span class="spacer" />
      <button class="btn btn-ghost" @click="emit('cancel')">{{ $t('common.cancel') }}</button>
      <button class="btn btn-primary" @click="emit('confirm')">
        {{ $t('snippetDocument.format') }}
      </button>
    </template>
  </BaseDialog>
</template>
