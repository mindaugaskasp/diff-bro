<script setup>
import BaseDialog from './BaseDialog.vue'

const emit = defineEmits(['answer'])
</script>

<template>
  <BaseDialog
    width="380px"
    :title="$t('settingsDialog.unsaved.title')"
    @close="emit('answer', 'keep')"
  >
    <p class="dialog-note">{{ $t('settingsDialog.unsaved.body') }}</p>
    <template #actions>
      <button class="btn btn-primary" @click="emit('answer', 'save')">
        {{ $t('settingsDialog.unsaved.save') }}
      </button>
      <button class="btn" @click="emit('answer', 'discard')">
        {{ $t('settingsDialog.unsaved.discard') }}
      </button>
      <button class="btn btn-ghost" @click="emit('answer', 'keep')">
        {{ $t('settingsDialog.unsaved.keepEditing') }}
      </button>
    </template>
  </BaseDialog>
</template>
