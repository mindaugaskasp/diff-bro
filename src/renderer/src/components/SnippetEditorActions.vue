<script setup>
// The snippet editor's action row, split out of SnippetEditorDialog to keep it
// within its line budget. Owns only the two bits of feedback state its buttons
// need (the copy flash, the two-step clear); everything else is the parent's.
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
const emit = defineEmits([
  'format',
  'copy',
  'capture',
  'clear',
  'reveal',
  'edit',
  'save',
  'close'
])

const { copied, flash } = useCopyFeedback()
// The twin of Copy, and adjacent to it: that adjacency is what makes them read
// as a choice between two things rather than two unrelated actions.
const { supported: canCopyFile, copyFile } = useCopyAsFile()
async function copyAsFile() {
  const draft = { name: props.name, content: props.content, secret: props.secret }
  if (await copyFile(snippetFile({ ...draft, lang: props.language }))) flash()
}
const copyFileTip = computed(() =>
  props.secret
    ? "Secret snippets can't be copied as a file — a staged copy would be plaintext on disk"
    : 'Put the snippet on the clipboard AS A FILE, to paste into a message or a folder'
)
const { armed: clearArmed, trigger: clearContent } = useArmedAction(() => emit('clear'))

// Mermaid's formatter repairs pasted damage rather than pretty-printing, so the
// control says which of the two it is about to do.
const isRepair = computed(() => props.language === 'mermaid')
const formatLabel = computed(() => (isRepair.value ? 'Repair' : 'Format'))
const formatTip = computed(() => {
  if (!props.canFormat) return 'Formatting is available for JSON, XML, SQL or Mermaid'
  return isRepair.value
    ? 'Put back the arrows, quotes and spaces a paste broke'
    : `Pretty-print as ${props.language.toUpperCase()}`
})
const clearTip = computed(() =>
  clearArmed.value
    ? 'Click again to clear the editor'
    : 'Clear the editor (e.g. remove pasted content)'
)
// Copy works whether or not the contents are on screen — that is the whole
// point of a secret snippet.
const copyTip = computed(() =>
  copied.value ? 'Copied to clipboard' : 'Copy the contents to the clipboard'
)

defineExpose({ flash })
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
    :data-tip="masked ? 'Show the contents' : 'Hide the contents again'"
    @click="emit('reveal')"
  >
    <AppIcon :name="masked ? 'eye' : 'eye-off'" />
    {{ masked ? 'Show' : 'Hide' }}
  </button>
  <button
    class="btn btn-sm"
    :class="{ copied }"
    :disabled="!hasContent"
    :data-tip="copyTip"
    @click="emit('copy')"
  >
    {{ copied ? 'Copied' : 'Copy' }}
  </button>
  <button
    v-if="canCopyFile && !editMode"
    class="btn btn-sm"
    :disabled="!hasContent || secret"
    :data-tip="copyFileTip"
    @click="copyAsFile"
  >
    <AppIcon name="clipboard" /> Copy as file
  </button>
  <button
    v-if="editMode"
    class="btn btn-sm"
    :class="{ armed: clearArmed }"
    :disabled="!hasContent"
    :data-tip="clearTip"
    @click="hasContent && clearContent()"
  >
    {{ clearArmed ? 'Confirm clear' : 'Clear' }}
  </button>
  <span class="spacer" />
  <!-- Viewing is when you are looking at the thing you want a picture of. Never
       for a secret: the store refuses it too. -->
  <button
    v-if="!editMode && !secret"
    class="btn"
    data-tip="A picture of this snippet, as the app draws it"
    @click="emit('capture')"
  >
    <AppIcon name="image" /> Capture
  </button>
  <button v-if="!editMode" class="btn btn-primary" @click="emit('edit')">
    <AppIcon name="edit" /> Edit
  </button>
  <button v-else class="btn btn-primary" :disabled="!canSave" @click="emit('save')">Save</button>
  <button class="btn btn-ghost" @click="emit('close')">{{ editMode ? 'Cancel' : 'Close' }}</button>
</template>

<style scoped src="./styles/SnippetEditorActions.css"></style>
