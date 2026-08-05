<script setup>
import { computed } from 'vue'
import { usePasteToCompareStore } from '../pasteToCompareStore'
import BaseDialog from '../../../components/BaseDialog.vue'

const paste = usePasteToCompareStore()
const overwrite = computed(() => paste.prompt === 'overwrite')

function confirm() {
  if (overwrite.value) paste.confirmOverwrite()
  else paste.confirmEnter()
}
</script>

<template>
  <BaseDialog
    width="420px"
    :title="overwrite ? 'Overwrite pasted text?' : 'Paste detected'"
    @close="paste.cancel()"
  >
    <p v-if="overwrite" class="dialog-note">
      {{ $t('pasteToCompare.pasteConfirmDialog.bothSidesAlreadyHaveContent') }}
    </p>
    <p v-else class="dialog-note">
      {{ $t('pasteToCompare.pasteConfirmDialog.pasteYourClipboardIntoThe') }}
    </p>
    <template #actions>
      <button class="btn btn-ghost" @click="paste.cancel()">{{ $t('common.cancel') }}</button>
      <button class="btn btn-primary" @click="confirm">
        {{ overwrite ? 'Overwrite' : 'Paste' }}
      </button>
    </template>
  </BaseDialog>
</template>
