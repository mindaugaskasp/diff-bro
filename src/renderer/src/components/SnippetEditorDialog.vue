<script setup>
// Create/edit a snippet: Monaco + tag-field wiring over useSnippetDraft.
import { computed, nextTick, ref, watch } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { DEFAULT_SNIPPET_DIALOG_SIZE } from '../utils/settingsDefaults'
import { useSnippetDraft } from '../composables/useSnippetDraft'
import { useFormatToolbar } from '../composables/useFormatToolbar'
import SnippetNameField from './SnippetNameField.vue'
import SnippetNameHint from './SnippetNameHint.vue'
import { useMonacoInput } from '../composables/useMonacoInput'
import { useFileTextDrop } from '../composables/useFileDrop'
import TagChipsField from './TagChipsField.vue'
import SnippetEditorHeader from './SnippetEditorHeader.vue'
import SnippetSecretToggle from './SnippetSecretToggle.vue'
import SnippetEditorActions from './SnippetEditorActions.vue'
import SnippetSecretMask from './SnippetSecretMask.vue'
import MermaidPreview from './MermaidPreview.vue'
import FormatToolbar from './FormatToolbar.vue'
import JiraRendered from './JiraRendered.vue'
import MarkdownRendered from './MarkdownRendered.vue'
import BaseDialog from './BaseDialog.vue'
import { t } from '../i18n'

const settings = useSettingsStore()
const container = ref(null)
// The tag field owns the tags; this ref is how save() reads them back.
const tagField = ref(null)

const {
  isNew,
  name,
  content,
  secret,
  masked,
  toggleReveal,
  saving,
  initialTags,
  chosenLanguage,
  language,
  isMermaid,
  isJira,
  isMarkdown,
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
  captureImage,
  expandDiagram
} = useSnippetDraft()

const readOnly = computed(() => !editMode.value)
const { reset, applySelectionEdit, layout } = useMonacoInput({
  container,
  content,
  language,
  readOnly
})

// A new Jira/Markdown snippet opens on the raw editor (it starts in edit mode);
// viewing an existing one opens on the rendered preview. `hasPreview` gates the
// toggle, toolbar and rendered view.
const plain = ref(editMode.value)
const hasPreview = computed(() => isJira.value || isMarkdown.value)
const { actions: toolbarActions, applyAction } = useFormatToolbar({
  isMarkdown,
  applySelectionEdit
})
// Relayout Monaco once it becomes visible (it may have mounted hidden).
watch(plain, (isPlain) => {
  if (isPlain) nextTick(layout)
})

// The action row owns its copy/clear feedback; this is its handle for the
// "Copied" flash, which fires only once the clipboard write succeeded.
const actions = ref(null)
async function copyAndFlash() {
  if (await copyContent()) actions.value?.flash()
}
// Revealing relayouts Monaco: masked, it measured zero and comes back blank.
function revealAndLayout() {
  toggleReveal()
  nextTick(layout)
}

// A file dropped on the editor loads its contents.
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
    tour="snippet-editor"
    resizable
    :min-size="{ width: 420, height: 620 }"
    :initial-size="settings.dialogSize('snippet') ?? DEFAULT_SNIPPET_DIALOG_SIZE"
    :title="
      isNew
        ? t('snippetEditorDialog.newSnippetTitle')
        : editMode
          ? $t('snippetEditorDialog.editSnippet')
          : $t('snippetEditorDialog.snippet')
    "
    :escape-closes="!editMode"
    :close-on-backdrop="!editMode"
    @close="requestClose"
    @resize="(s) => settings.setDialogSize('snippet', s)"
  >
    <div class="fields">
      <label class="grow">
        {{ $t('snippetEditorDialog.name') }}
        <SnippetNameField
          v-model="name"
          :placeholder="$t('snippetEditorDialog.snippetName')"
          :readonly="readOnly"
        />
        <span v-if="editMode && !name.trim()" class="required-hint">
          {{ $t('snippetEditorDialog.aSnippetNeedsAName') }}
        </span>
        <SnippetNameHint v-if="editMode" :name="name" />
      </label>
    </div>
    <TagChipsField ref="tagField" :initial="initialTags" :readonly="readOnly" />
    <SnippetSecretToggle v-model="secret" :readonly="readOnly" />
    <SnippetEditorHeader
      v-model:plain="plain"
      v-model:chosen-language="chosenLanguage"
      :edit-mode="editMode"
      :has-preview="hasPreview"
      :language="language"
      :read-only="readOnly"
    />
    <FormatToolbar
      v-if="hasPreview && plain && editMode"
      :actions="toolbarActions"
      @action="applyAction"
    />
    <div
      class="editor-area"
      :class="{ editing: editMode }"
      @dragover.capture.prevent.stop
      @drop.capture.prevent.stop="editMode && onDropFile($event)"
    >
      <div v-if="(!hasPreview || plain) && !masked" ref="container" class="editor"></div>
      <JiraRendered v-if="isJira && !plain && !masked" class="editor rendered" :content="content" />
      <MarkdownRendered
        v-if="isMarkdown && !plain && !masked"
        class="editor rendered"
        :content="content"
      />
      <SnippetSecretMask v-if="masked" />
    </div>
    <p v-if="editMode && !content.trim()" class="required-hint">
      {{ $t('snippetEditorDialog.aSnippetNeedsContentTo') }}
    </p>
    <MermaidPreview v-if="isMermaid && !masked" :code="content" @expand="expandDiagram" />
    <template #actions>
      <SnippetEditorActions
        ref="actions"
        :edit-mode="editMode"
        :can-format="canFormat"
        :name="name"
        :content="content"
        :language="language"
        :has-content="!!content"
        :can-save="!!name.trim() && !!content.trim() && !saving"
        :secret="secret"
        :masked="masked"
        @format="formatContent"
        @copy="copyAndFlash"
        @capture="captureImage"
        @clear="reset('')"
        @reveal="revealAndLayout"
        @edit="startEditing"
        @save="saveSnippet"
        @close="requestClose"
      />
    </template>

    <!-- Unsaved-changes guard: shown over the actions when a dirty draft is
         about to be discarded via Cancel or ×. -->
    <div v-if="confirmingDiscard" class="discard-confirm" role="alertdialog">
      <span>{{ $t('snippetEditorDialog.discardThisSnippetYourUnsaved') }}</span>
      <div class="discard-actions">
        <button class="btn btn-sm btn-ghost" @click="keepEditing">
          {{ $t('snippetEditorDialog.keepEditing') }}
        </button>
        <button class="btn btn-sm btn-danger" @click="discardDraft">
          {{ $t('snippetEditorDialog.discard') }}
        </button>
      </div>
    </div>
  </BaseDialog>
</template>

<style scoped src="./styles/SnippetEditorDialog.css"></style>
