<script setup>
// Preview of a saved diff's screenshot, with the two things worth doing with it:
// copy it to the clipboard, or save it as a PNG. The picture was taken by the
// main process (src/main/diffImage.js) and still lives there — this dialog only
// shows the preview it was handed.
import { computed, ref } from 'vue'
import { useImageExportStore } from '../imageExportStore'
import { useCopyFeedback } from '../../../composables/useCopyFeedback'
import BaseDialog from '../../../components/BaseDialog.vue'
import AppIcon from '../../../components/AppIcon.vue'

const imageExport = useImageExportStore()
const { copied, flash } = useCopyFeedback()
const busy = ref(false)

// The same preview serves a diff, a snippet and a diagram; only the noun moves.
const noun = computed(() => imageExport.imageEntry.subject ?? 'diff')
const isDiff = computed(() => noun.value === 'diff')
const alt = computed(() =>
  isDiff.value
    ? `Diff view of ${imageExport.imageEntry.name}`
    : `${noun.value === 'diagram' ? 'Diagram' : 'Snippet'}: ${imageExport.imageEntry.name}`
)
const of = computed(() =>
  isDiff.value ? 'the diff view as it is right now' : `this ${noun.value}`
)

async function copy() {
  busy.value = true
  if (await imageExport.copyImage()) flash()
  busy.value = false
}

async function save() {
  busy.value = true
  await imageExport.saveImage()
  busy.value = false
}
</script>

<template>
  <BaseDialog width="720px" title="Export as image" @close="imageExport.closeImageExport()">
    <div class="shot">
      <img :src="imageExport.imageEntry.dataUrl" :alt="alt" />
    </div>
    <p class="dialog-note">
      A {{ imageExport.imageEntry.width }} × {{ imageExport.imageEntry.height }} screenshot of
      {{ of }}.
    </p>
    <p v-if="imageExport.imageEntry.hiddenColumns" class="dialog-note warn">
      About {{ imageExport.imageEntry.hiddenColumns }} more
      {{ imageExport.imageEntry.hiddenColumns === 1 ? 'screen' : 'screens' }} of columns sit off the
      right edge and aren’t in the picture. Widen the window to take them in.
    </p>
    <p v-if="imageExport.imageEntry.truncated" class="dialog-note warn">
      This {{ noun }} was longer than the export height — the picture stops partway down. Raise
      <strong>Max diff image height</strong> in Settings → Limits to capture more.
    </p>

    <template #actions>
      <button type="button" class="btn btn-primary" :disabled="busy" @click="copy">
        <AppIcon :name="copied ? 'check' : 'copy'" />
        {{ copied ? 'Copied' : 'Copy image' }}
      </button>
      <button type="button" class="btn" :disabled="busy" @click="save">Save PNG…</button>
      <button type="button" class="btn btn-ghost" @click="imageExport.closeImageExport()">
        Close
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/DiffImageDialog.css"></style>
