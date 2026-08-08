<script setup>
// The snippet editor's action row, split out of SnippetEditorDialog to keep it
// within its line budget. Owns only the two bits of feedback state its buttons
// need (the copy flash, the two-step clear); everything else is the parent's.
import { t } from '../i18n'
import { computed } from 'vue'
import { useArmedAction } from '../composables/useArmedAction'
import { useCopyFeedback } from '../composables/useCopyFeedback'
import { useCopyAsFile } from '../composables/useCopyAsFile'
import { snippetFile } from '../utils/copyAsFile'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  editMode: { type: Boolean, required: true },
  name: { type: String, default: '' },
  content: { type: String, default: '' },
  canFormat: { type: Boolean, required: true },
  language: { type: String, required: true },
  hasContent: { type: Boolean, required: true },
  canSave: { type: Boolean, required: true },
  // A secret snippet adds a reveal toggle; `masked` is its current state.
  secret: { type: Boolean, default: false },
  masked: { type: Boolean, default: false }
})
const emit = defineEmits(['format', 'copy', 'capture', 'clear', 'reveal', 'edit', 'save', 'close'])

// One flash, two buttons — so it records WHICH was pressed. A bare boolean put
// the acknowledgement on Copy when the reader had pressed Copy as file, the
// button right beside it. That is what flash's `mark` is for.
const { copied, flash } = useCopyFeedback()
const copiedText = computed(() => copied.value === 'text')
const copiedFile = computed(() => copied.value === 'file')
// The twin of Copy, and adjacent to it: that adjacency is what makes them read
// as a choice between two things rather than two unrelated actions.
const { supported: canCopyFile, copyFile } = useCopyAsFile()
async function copyAsFile() {
  const draft = { name: props.name, content: props.content, secret: props.secret }
  if (await copyFile(snippetFile({ ...draft, lang: props.language }))) flash('file')
}
const copyFileTip = computed(() =>
  props.secret
    ? "Secret snippets can't be copied as a file — a staged copy would be plaintext on disk"
    : t('snippetEditorActions.copyAsFileTip')
)
const { armed: clearArmed, trigger: clearContent } = useArmedAction(() => emit('clear'))

// Mermaid's formatter repairs pasted damage rather than pretty-printing, so the
// control says which of the two it is about to do.
const isRepair = computed(() => props.language === 'mermaid')
const formatLabel = computed(() => (isRepair.value ? 'Repair' : 'Format'))
const formatTip = computed(() => {
  if (!props.canFormat) return t('snippetEditorActions.formatUnavailable')
  return isRepair.value
    ? t('snippetEditorActions.unmangleTip')
    : t('snippetEditorActions.prettyPrintAs', { format: props.language.toUpperCase() })
})
const clearTip = computed(() =>
  clearArmed.value
    ? t('snippetEditorActions.clickAgainToClear')
    : t('snippetEditorActions.clearTheEditor')
)
// Copy works whether or not the contents are on screen — that is the whole
// point of a secret snippet.
const copyTip = computed(() =>
  copiedText.value
    ? t('snippetEditorActions.copiedToClipboard')
    : t('snippetEditorActions.copyTheContents')
)

// The parent owns the clipboard write and flashes only once it succeeded.
defineExpose({ flash: () => flash('text') })
</script>

<template>
  <button
    v-if="editMode"
    class="btn btn-sm"
    :disabled="!canFormat"
    :data-tip="formatTip"
    @click="emit('format')"
  >
    {{ formatLabel }}
  </button>
  <button
    v-if="secret"
    class="btn btn-sm"
    :data-tip="
      masked
        ? $t('snippetEditorActions.showTheContents')
        : $t('snippetEditorActions.hideTheContentsAgain')
    "
    @click="emit('reveal')"
  >
    <AppIcon :name="masked ? 'eye' : 'eye-off'" />
    {{ masked ? $t('snippetEditorActions.show') : $t('snippetEditorActions.hide') }}
  </button>
  <!-- aria-label is the STABLE name on both: only the visible word swaps for the
       flash, so a screen reader is never told the button it is on has become a
       different button mid-press. -->
  <button
    class="btn btn-sm"
    :class="{ copied: copiedText }"
    :disabled="!hasContent"
    :data-tip="copyTip"
    :aria-label="$t('common.copy')"
    @click="emit('copy')"
  >
    {{ copiedText ? $t('common.copied') : $t('common.copy') }}
  </button>
  <button
    v-if="canCopyFile && !editMode"
    class="btn btn-sm"
    :class="{ copied: copiedFile }"
    :disabled="!hasContent || secret"
    :data-tip="copyFileTip"
    :aria-label="$t('snippetEditorActions.copyAsFile')"
    @click="copyAsFile"
  >
    <AppIcon :name="copiedFile ? 'check' : 'clipboard'" />
    {{ copiedFile ? $t('common.copied') : $t('snippetEditorActions.copyAsFile') }}
  </button>
  <button
    v-if="editMode"
    class="btn btn-sm"
    :class="{ armed: clearArmed }"
    :disabled="!hasContent"
    :data-tip="clearTip"
    @click="hasContent && clearContent()"
  >
    {{ clearArmed ? $t('snippetEditorActions.confirmClear') : $t('snippetEditorActions.clear') }}
  </button>
  <span class="spacer" />
  <!-- Viewing is when you are looking at the thing you want a picture of. Never
       for a secret: the store refuses it too. -->
  <button
    v-if="!editMode && !secret"
    class="btn"
    :data-tip="$t('snippetEditorActions.aPictureOfThisSnippet')"
    @click="emit('capture')"
  >
    <AppIcon name="image" /> {{ $t('snippetEditorActions.capture') }}
  </button>
  <button v-if="!editMode" class="btn btn-primary" @click="emit('edit')">
    <AppIcon name="edit" /> {{ $t('snippetEditorActions.edit') }}
  </button>
  <button
    v-else
    class="btn btn-primary"
    data-tour="snippet-save"
    :disabled="!canSave"
    @click="emit('save')"
  >
    {{ $t('common.save') }}
  </button>
  <button class="btn btn-ghost" @click="emit('close')">
    {{ editMode ? $t('common.cancel') : $t('common.close') }}
  </button>
</template>

<style scoped src="./styles/SnippetEditorActions.css"></style>
