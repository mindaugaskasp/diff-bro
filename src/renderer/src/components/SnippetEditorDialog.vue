<script setup>
// Create/edit a snippet: name, tag chips, a Monaco content editor, and (for
// Mermaid) a live diagram preview. The draft itself (fields, syntax, save,
// format) lives in useSnippetDraft; the tag field owns its own tags. What is
// left here is the wiring between them.
import { ref } from 'vue'
import { SNIPPET_LANGUAGES } from '../utils/detectLanguage'
import { useSnippetDraft } from '../composables/useSnippetDraft'
import { useMonacoInput } from '../composables/useMonacoInput'
import { useFileTextDrop } from '../composables/useFileDrop'
import { useArmedAction } from '../composables/useArmedAction'
import TagChipsField from './TagChipsField.vue'
import MermaidDiagram from './MermaidDiagram.vue'
import BaseDialog from './BaseDialog.vue'
import AppIcon from './AppIcon.vue'

const languages = SNIPPET_LANGUAGES
const container = ref(null)
// The tag field owns the tags; this ref is how save() reads them back.
const tagField = ref(null)

const {
  isNew,
  name,
  content,
  saving,
  initialTags,
  chosenLanguage,
  language,
  isMermaid,
  canFormat,
  save,
  confirmingDiscard,
  requestClose,
  keepEditing,
  discardDraft,
  formatContent,
  copyContent,
  expandDiagram
} = useSnippetDraft()

const { reset } = useMonacoInput({ container, content, language })

// Clearing can discard a lot of typing, so it is a two-step confirm.
const { armed: clearArmed, trigger: clearContent } = useArmedAction(() => reset(''))

// A file dropped on the editor loads its contents (capture + stop in the
// template, so the window-level diff drop never sees it).
const { onDropFile } = useFileTextDrop((text, fileName) => {
  content.value = text
  if (!name.value.trim()) name.value = fileName
})

function saveSnippet() {
  save({ tags: tagField.value.tags, tagColors: tagField.value.newColors() })
}
</script>

<template>
  <BaseDialog
    width="560px"
    :title="isNew ? 'New Snippet' : 'Edit Snippet'"
    :escape-closes="false"
    @close="requestClose"
  >
    <div class="fields">
      <label class="grow">
        Name
        <input v-model="name" type="text" spellcheck="false" placeholder="Snippet name…" />
        <span v-if="!name.trim()" class="required-hint">A snippet needs a name to save.</span>
      </label>
    </div>
    <TagChipsField ref="tagField" :initial="initialTags" />
    <div class="editor-header">
      <span>Content <span class="drop-hint">— or drop a file here</span></span>
      <label class="lang-picker">
        Syntax
        <select v-model="chosenLanguage">
          <option v-for="l in languages" :key="l.id" :value="l.id">{{ l.label }}</option>
        </select>
        <span v-if="chosenLanguage === 'auto'" class="lang-detected">→ {{ language }}</span>
      </label>
    </div>
    <div
      ref="container"
      class="editor"
      @dragover.capture.prevent.stop
      @drop.capture.prevent.stop="onDropFile"
    ></div>
    <p v-if="!content.trim()" class="required-hint">A snippet needs content to save.</p>
    <div v-if="isMermaid" class="mmd-preview">
      <div class="mmd-preview-head">
        <span>Diagram preview</span>
        <button
          type="button"
          class="btn btn-sm btn-ghost"
          :disabled="!content.trim()"
          title="Open the full, resizable diagram viewer"
          @click="expandDiagram"
        >
          <AppIcon name="expand" /> Expand
        </button>
      </div>
      <div class="mmd-preview-body">
        <MermaidDiagram :code="content" />
      </div>
    </div>
    <template #actions>
      <button
        class="btn btn-sm btn-ghost"
        :disabled="!canFormat"
        :title="
          canFormat
            ? `Pretty-print as ${language.toUpperCase()}`
            : 'Formatting is available for JSON, XML, or SQL'
        "
        @click="formatContent"
      >
        Format
      </button>
      <button
        class="btn btn-sm btn-ghost"
        :disabled="!content"
        title="Copy content"
        @click="copyContent"
      >
        Copy
      </button>
      <button
        class="btn btn-sm btn-ghost"
        :class="{ armed: clearArmed }"
        :disabled="!content"
        :title="
          clearArmed
            ? 'Click again to clear the editor'
            : 'Clear the editor (e.g. remove pasted content)'
        "
        @click="content && clearContent()"
      >
        {{ clearArmed ? 'Confirm clear' : 'Clear' }}
      </button>
      <span class="spacer" />
      <button
        class="btn btn-primary"
        :disabled="!name.trim() || !content.trim() || saving"
        @click="saveSnippet"
      >
        Save
      </button>
      <button class="btn btn-ghost" @click="requestClose">Cancel</button>
    </template>

    <!-- Unsaved-changes guard: shown over the actions when a dirty draft is
         about to be discarded via Cancel or ×. -->
    <div v-if="confirmingDiscard" class="discard-confirm" role="alertdialog">
      <span>Discard this snippet? Your unsaved content will be lost.</span>
      <div class="discard-actions">
        <button class="btn btn-sm btn-ghost" @click="keepEditing">Keep editing</button>
        <button class="btn btn-sm btn-danger" @click="discardDraft">Discard</button>
      </div>
    </div>
  </BaseDialog>
</template>

<style scoped src="./styles/SnippetEditorDialog.css"></style>
