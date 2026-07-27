<script setup>
// Create/edit a snippet: name, tag chips, a Monaco content editor, and (for
// Mermaid) a live diagram preview. The draft itself (fields, syntax, save,
// format) lives in useSnippetDraft; the tag field owns its own tags. What is
// left here is the wiring between them.
import { computed, nextTick, ref, watch } from 'vue'
import { SNIPPET_LANGUAGES } from '../utils/detectLanguage'
import { applyJiraAction } from '../utils/jiraMarkup'
import { useSettingsStore } from '../stores/settingsStore'
import { useSnippetDraft } from '../composables/useSnippetDraft'
import { useMonacoInput } from '../composables/useMonacoInput'
import { useFileTextDrop } from '../composables/useFileDrop'
import { useArmedAction } from '../composables/useArmedAction'
import TagChipsField from './TagChipsField.vue'
import MermaidPreview from './MermaidPreview.vue'
import JiraToolbar from './JiraToolbar.vue'
import JiraRendered from './JiraRendered.vue'
import BaseDialog from './BaseDialog.vue'
import AppIcon from './AppIcon.vue'

const languages = SNIPPET_LANGUAGES
const settings = useSettingsStore()
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
  isJira,
  editMode,
  startEditing,
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

const readOnly = computed(() => !editMode.value)
const { reset, applySelectionEdit, layout } = useMonacoInput({
  container,
  content,
  language,
  readOnly
})

// Jira/Confluence snippets open on the rendered preview; "Plain" flips to the
// raw-markup editor (the only place the toolbar edits). Non-Jira syntaxes always
// show the editor.
const plain = ref(false)
// The editor may have mounted in a hidden container (rendered view was showing);
// relayout Monaco once it becomes visible again.
watch(plain, (isPlain) => {
  if (isPlain) nextTick(layout)
})

// A wiki-markup toolbar button: apply its transform to the current selection.
function applyJira(id) {
  applySelectionEdit((model) => applyJiraAction(id, model))
}

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
    resizable
    :min-size="{ width: 420, height: 460 }"
    :initial-size="settings.dialogSize('snippet')"
    :title="isNew ? 'New Snippet' : editMode ? 'Edit Snippet' : 'Snippet'"
    :escape-closes="!editMode"
    :close-on-backdrop="!editMode"
    @close="requestClose"
    @resize="(s) => settings.setDialogSize('snippet', s)"
  >
    <div class="fields">
      <label class="grow">
        Name
        <input
          v-model="name"
          type="text"
          spellcheck="false"
          placeholder="Snippet name…"
          :readonly="readOnly"
        />
        <span v-if="editMode && !name.trim()" class="required-hint">
          A snippet needs a name to save.
        </span>
      </label>
    </div>
    <TagChipsField ref="tagField" :initial="initialTags" :readonly="readOnly" />
    <div class="editor-header">
      <span>Content <span v-if="editMode" class="drop-hint">— or drop a file here</span></span>
      <div class="editor-controls">
        <div v-if="isJira" class="view-toggle" role="group" aria-label="View mode">
          <button type="button" :class="{ active: !plain }" @click="plain = false">Rendered</button>
          <button type="button" :class="{ active: plain }" @click="plain = true">Plain</button>
        </div>
        <label class="lang-picker">
          Syntax
          <select v-model="chosenLanguage" :disabled="readOnly">
            <option v-for="l in languages" :key="l.id" :value="l.id">{{ l.label }}</option>
          </select>
          <span v-if="chosenLanguage === 'auto'" class="lang-detected">→ {{ language }}</span>
        </label>
      </div>
    </div>
    <JiraToolbar v-if="isJira && plain && editMode" @action="applyJira" />
    <div
      class="editor-area"
      @dragover.capture.prevent.stop
      @drop.capture.prevent.stop="editMode && onDropFile($event)"
    >
      <div v-show="!isJira || plain" ref="container" class="editor"></div>
      <JiraRendered v-if="isJira && !plain" class="editor rendered" :content="content" />
    </div>
    <p v-if="editMode && !content.trim()" class="required-hint">A snippet needs content to save.</p>
    <MermaidPreview v-if="isMermaid" :code="content" @expand="expandDiagram" />
    <template #actions>
      <button
        v-if="editMode"
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
        v-if="editMode"
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
      <button v-if="!editMode" class="btn btn-primary" @click="startEditing">
        <AppIcon name="edit" /> Edit
      </button>
      <button
        v-else
        class="btn btn-primary"
        :disabled="!name.trim() || !content.trim() || saving"
        @click="saveSnippet"
      >
        Save
      </button>
      <button class="btn btn-ghost" @click="requestClose">{{ editMode ? 'Cancel' : 'Close' }}</button>
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
