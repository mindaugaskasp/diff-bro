<script setup>
// Preview of a saved diff's screenshot, with the two things worth doing with it:
// copy it to the clipboard, or save it as a PNG. The picture was taken by the
// main process (src/main/diffImage.js) and still lives there — this dialog only
// shows the preview it was handed.
import { computed, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useCopyFeedback } from '../composables/useCopyFeedback'
import BaseDialog from './BaseDialog.vue'
import AppIcon from './AppIcon.vue'

const diff = useDiffStore()
const { copied, flash } = useCopyFeedback()
const busy = ref(false)

// The same preview serves a diff, a snippet and a diagram; only the noun moves.
const noun = computed(() => diff.imageEntry.subject ?? 'diff')
const isDiff = computed(() => noun.value === 'diff')
const alt = computed(() =>
  isDiff.value
    ? `Diff view of ${diff.imageEntry.name}`
    : `${noun.value === 'diagram' ? 'Diagram' : 'Snippet'}: ${diff.imageEntry.name}`
)
const of = computed(() =>
  isDiff.value ? 'the diff view as it is right now' : `this ${noun.value}`
)

async function copy() {
  busy.value = true
  if (await diff.copyImage()) flash()
  busy.value = false
}

async function save() {
  busy.value = true
  await diff.saveImage()
  busy.value = false
}
</script>

<template>
  <BaseDialog width="720px" title="Export as image" @close="diff.closeImageExport()">
    <div class="shot">
      <img :src="diff.imageEntry.dataUrl" :alt="alt" />
    </div>
    <p class="dialog-note">
      A {{ diff.imageEntry.width }} × {{ diff.imageEntry.height }} screenshot of {{ of }}.
    </p>
    <p v-if="diff.imageEntry.hiddenColumns" class="dialog-note warn">
      About {{ diff.imageEntry.hiddenColumns }} more
      {{ diff.imageEntry.hiddenColumns === 1 ? 'screen' : 'screens' }} of columns sit off the right
      edge and aren’t in the picture. Widen the window to take them in.
    </p>
    <p v-if="diff.imageEntry.truncated" class="dialog-note warn">
      This {{ noun }} was longer than the export height — the picture stops partway down. Raise
      <strong>Max diff image height</strong> in Settings → Limits to capture more.
    </p>

    <template #actions>
      <button type="button" class="btn btn-primary" :disabled="busy" @click="copy">
        <AppIcon :name="copied ? 'check' : 'copy'" />
        {{ copied ? 'Copied' : 'Copy image' }}
      </button>
      <button type="button" class="btn" :disabled="busy" @click="save">Save PNG…</button>
      <button type="button" class="btn btn-ghost" @click="diff.closeImageExport()">Close</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/DiffImageDialog.css"></style>
