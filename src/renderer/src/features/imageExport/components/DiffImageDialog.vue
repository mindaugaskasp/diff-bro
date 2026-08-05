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
  <BaseDialog
    width="720px"
    :title="$t('imageExport.diffImageDialog.exportAsImage')"
    @close="imageExport.closeImageExport()"
  >
    <div class="shot">
      <img :src="imageExport.imageEntry.dataUrl" :alt="alt" />
    </div>
    <p class="dialog-note">
      {{
        $t('imageExport.diffImageDialog.shotOf', {
          w: imageExport.imageEntry.width,
          h: imageExport.imageEntry.height,
          of
        })
      }}
    </p>
    <p v-if="imageExport.imageEntry.hiddenColumns" class="dialog-note warn">
      {{ $t('imageExport.diffImageDialog.hiddenColumns', imageExport.imageEntry.hiddenColumns) }}
    </p>
    <p v-if="imageExport.imageEntry.truncated" class="dialog-note warn">
      <i18n-t keypath="imageExport.diffImageDialog.truncated" tag="span" :plural="1">
        <template #noun>{{ noun }}</template>
        <template #setting>
          <strong>{{ $t('imageExport.diffImageDialog.maxDiffImageHeight') }}</strong>
        </template>
      </i18n-t>
    </p>

    <template #actions>
      <button type="button" class="btn btn-primary" :disabled="busy" @click="copy">
        <AppIcon :name="copied ? 'check' : 'copy'" />
        {{ copied ? $t('common.copied') : $t('diffImageDialog.copyImage') }}
      </button>
      <button type="button" class="btn" :disabled="busy" @click="save">
        {{ $t('imageExport.diffImageDialog.savePNG') }}
      </button>
      <button type="button" class="btn btn-ghost" @click="imageExport.closeImageExport()">
        {{ $t('common.close') }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/DiffImageDialog.css"></style>
