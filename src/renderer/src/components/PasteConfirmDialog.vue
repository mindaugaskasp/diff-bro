<script setup>
import { computed } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import BaseDialog from './BaseDialog.vue'

const store = useDiffStore()
const overwrite = computed(() => store.pastePrompt === 'overwrite')

function confirm() {
  if (overwrite.value) store.confirmPasteOverwrite()
  else store.confirmPasteEnter()
}
</script>

<template>
  <BaseDialog
    width="420px"
    :title="overwrite ? 'Overwrite pasted text?' : 'Paste detected'"
    @close="store.cancelPaste()"
  >
    <p v-if="overwrite" class="dialog-note">
      Both sides already have content. Paste your clipboard into the left side, replacing it? What's
      there will be lost.
    </p>
    <p v-else class="dialog-note">
      Paste your clipboard into the comparison to diff it? It fills the empty side (or starts a paste
      comparison), and is only read after you confirm.
    </p>
    <template #actions>
      <button class="btn btn-ghost" @click="store.cancelPaste()">Cancel</button>
      <button class="btn btn-primary" @click="confirm">{{ overwrite ? 'Overwrite' : 'Paste' }}</button>
    </template>
  </BaseDialog>
</template>
