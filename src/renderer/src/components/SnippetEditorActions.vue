<script setup>
// The snippet editor's action row, split out of SnippetEditorDialog to keep it
// within its line budget. Owns only the two bits of feedback state its buttons
// need (the copy flash, the two-step clear); everything else is the parent's.
import { computed } from 'vue'
import { useArmedAction } from '../composables/useArmedAction'
import { useCopyFeedback } from '../composables/useCopyFeedback'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  editMode: { type: Boolean, required: true },
  canFormat: { type: Boolean, required: true },
  language: { type: String, required: true },
  hasContent: { type: Boolean, required: true },
  canSave: { type: Boolean, required: true },
  // A secret snippet adds a reveal toggle; `masked` is its current state.
  secret: { type: Boolean, default: false },
  masked: { type: Boolean, default: false }
})
const emit = defineEmits(['format', 'copy', 'clear', 'reveal', 'edit', 'save', 'close'])

const { copied, flash } = useCopyFeedback()
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
    class="btn btn-sm btn-ghost"
    :disabled="!canFormat"
    :data-tip="formatTip"
    @click="emit('format')"
  >
    {{ formatLabel }}
  </button>
  <button
    v-if="secret"
    class="btn btn-sm btn-ghost"
    :data-tip="masked ? 'Show the contents' : 'Hide the contents again'"
    @click="emit('reveal')"
  >
    <AppIcon :name="masked ? 'eye' : 'eye-off'" />
    {{ masked ? 'Show' : 'Hide' }}
  </button>
  <button
    class="btn btn-sm btn-ghost"
    :class="{ copied }"
    :disabled="!hasContent"
    :data-tip="copyTip"
    @click="emit('copy')"
  >
    {{ copied ? 'Copied' : 'Copy' }}
  </button>
  <button
    v-if="editMode"
    class="btn btn-sm btn-ghost"
    :class="{ armed: clearArmed }"
    :disabled="!hasContent"
    :data-tip="clearTip"
    @click="hasContent && clearContent()"
  >
    {{ clearArmed ? 'Confirm clear' : 'Clear' }}
  </button>
  <span class="spacer" />
  <button v-if="!editMode" class="btn btn-primary" @click="emit('edit')">
    <AppIcon name="edit" /> Edit
  </button>
  <button v-else class="btn btn-primary" :disabled="!canSave" @click="emit('save')">Save</button>
  <button class="btn btn-ghost" @click="emit('close')">{{ editMode ? 'Cancel' : 'Close' }}</button>
</template>

<style scoped src="./styles/SnippetEditorActions.css"></style>
