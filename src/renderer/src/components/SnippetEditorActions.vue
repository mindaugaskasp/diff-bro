<script setup>
// The same buttons viewing and editing, so none moves under the pointer.
import { t } from '../i18n'
import { computed } from 'vue'
import { useCopyFeedback } from '../composables/useCopyFeedback'
import { useCopyAsFile } from '../composables/useCopyAsFile'
import { snippetFile } from '../utils/copyAsFile'
import { useSnippetStore } from '../stores/snippetStore'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  editMode: { type: Boolean, required: true },
  name: { type: String, default: '' },
  content: { type: String, default: '' },
  language: { type: String, required: true },
  hasContent: { type: Boolean, required: true },
  canSave: { type: Boolean, required: true },
  // A secret snippet adds a reveal toggle; `masked` is its current state.
  secret: { type: Boolean, default: false },
  masked: { type: Boolean, default: false },
  snippetId: { type: String, default: null }
})
const emit = defineEmits(['copy', 'capture', 'reveal', 'save', 'history'])

// One flash, two buttons — so it records WHICH was pressed.
const { copied, flash } = useCopyFeedback()
const copiedText = computed(() => copied.value === 'text')
const copiedFile = computed(() => copied.value === 'file')
const { supported: canCopyFile, copyFile } = useCopyAsFile()
async function copyAsFile() {
  const draft = { name: props.name, content: props.content, secret: props.secret }
  if (await copyFile(snippetFile({ ...draft, lang: props.language }))) flash('file')
}
const copyFileTip = computed(() =>
  props.secret
    ? t('snippetEditorActions.secretCopyAsFileTip')
    : t('snippetEditorActions.copyAsFileTip')
)

const store = useSnippetStore()
const hasHistory = computed(
  () => (store.entries.find((e) => e.id === props.snippetId)?.history?.length ?? 0) > 0
)
// A picture of a diagram IS the diagram; a picture of text is a worse copy.
const isMermaid = computed(() => props.language === 'mermaid')
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
  <!-- aria-label is the STABLE name: only the visible word swaps for the flash. -->
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
    v-if="canCopyFile"
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
  <span class="spacer" />
  <button
    v-if="hasHistory"
    class="btn"
    :data-tip="$t('snippetEditorActions.historyTip')"
    @click="emit('history')"
  >
    <AppIcon name="clock" /> {{ $t('snippetEditorActions.history') }}
  </button>
  <!-- Never for a secret: the store refuses it too. -->
  <button
    v-if="!secret && isMermaid"
    class="btn"
    :disabled="editMode"
    :data-tip="$t('snippetEditorActions.aPictureOfThisSnippet')"
    @click="emit('capture')"
  >
    <AppIcon name="image" /> {{ $t('snippetEditorActions.capture') }}
  </button>
  <button
    class="btn btn-primary"
    data-tour="snippet-save"
    :disabled="!canSave"
    :aria-label="$t('common.save')"
    @click="emit('save')"
  >
    {{ $t('common.save') }}
  </button>
</template>

<style scoped src="./styles/SnippetEditorActions.css"></style>
