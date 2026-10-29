<script setup>
import { reactive, ref, computed, watch } from 'vue'
import { useTabsStore } from '../stores/tabsStore'
import { useDiffStore } from '../stores/diffStore'
import { useSnippetDraft } from '../composables/useSnippetDraft'
import { useFormatToolbar } from '../composables/useFormatToolbar'
import { useSnippetEditorView } from '../composables/useSnippetEditorView'
import { useMonacoInput } from '../composables/useMonacoInput'
import { useFileTextDrop } from '../composables/useFileDrop'
import { useSnippetFindKeys } from '../composables/useSnippetFindKeys'
import { useSnippetInlineEdit } from '../composables/useSnippetInlineEdit'
import SnippetDocumentHead from './SnippetDocumentHead.vue'
import SnippetEditorHeader from './SnippetEditorHeader.vue'
import SnippetEditorActions from './SnippetEditorActions.vue'
import SnippetSecretMask from './SnippetSecretMask.vue'
import SnippetHistoryPanel from './SnippetHistoryPanel.vue'
import SnippetStatusBar from './SnippetStatusBar.vue'
import MermaidPreview from './MermaidPreview.vue'
import FormatToolbar from './FormatToolbar.vue'
import JiraRendered from './JiraRendered.vue'
import MarkdownRendered from './MarkdownRendered.vue'
import RenderedEditor from './RenderedEditor.vue'
import { useTabContent } from '../composables/useTabContent'
import { t } from '../i18n'

const props = defineProps({ tab: { type: Object, required: true } })
const tabs = useTabsStore()
const inFront = computed(() => tabs.activeId === props.tab.id)
const editing = reactive({ ...(props.tab.snippet.initial ?? {}), id: props.tab.snippet.id })
const draft = useSnippetDraft({
  editing,
  onClose: () => {
    tabs.setSnippetMeta(props.tab.id, { dirty: false })
    tabs.requestClose(props.tab.id)
  },
  onSaved: (id) => {
    tabs.setSnippetMeta(props.tab.id, { snippetId: id })
    draft.editMode.value = false
    // Saved, it reads as an existing snippet opened fresh: masked, and rendered.
    draft.revealed.value = false
    plain.value = false
  }
})
const { name, content, masked, language, isMermaid, isJira, isMarkdown, editMode } = draft
const { saveAsFile } = useTabContent(props.tab, draft, editing)

watch(name, (n) => tabs.setSnippetMeta(props.tab.id, { title: n.trim() }), { immediate: true })
watch(draft.isDirty, (d) => tabs.setSnippetMeta(props.tab.id, { dirty: d }), { immediate: true })

const container = ref(null)
const head = ref(null)
const readOnly = computed(() => !editMode.value)
const { applySelectionEdit, layout, openFind, cursor } = useMonacoInput({
  container,
  content,
  language,
  readOnly
})
const docRoot = ref(null)
useSnippetFindKeys({ root: docRoot, editing: editMode, openFind })
const hasPreview = computed(() => isJira.value || isMarkdown.value)
const { plain, revealAndLayout } = useSnippetEditorView({
  editMode,
  layout,
  toggleReveal: draft.toggleReveal
})
const renderedEditor = ref(null)
const { actions: toolbarActions, applyAction } = useFormatToolbar({
  isMarkdown,
  applySelectionEdit,
  plain,
  rendered: renderedEditor
})

const actions = ref(null)
async function copyAndFlash() {
  if (await draft.copyContent()) actions.value?.flash()
}
const { onDropFile } = useFileTextDrop((text, fileName) => {
  content.value = text
  if (!name.value.trim()) name.value = fileName
})
const saveSnippet = () => draft.save(head.value.tagValues())

const docLabel = computed(() =>
  t(
    draft.isNew.value
      ? 'snippetEditorDialog.newSnippetTitle'
      : editMode.value
        ? 'snippetEditorDialog.editSnippet'
        : 'snippetEditorDialog.snippet'
  )
)

const inline = useSnippetInlineEdit({ draft, tab: props.tab, head, save: saveSnippet, onDropFile })

const showHistory = ref(false)
const compareWith = () =>
  editing.id
    ? useDiffStore().dropSnippets([editing.id], 'left')
    : useDiffStore().drop('left', editing.openedPath)
</script>

<template>
  <section
    ref="docRoot"
    class="snippet-doc"
    data-tour="snippet-editor"
    role="region"
    :aria-label="docLabel"
    @keydown.capture="inline.onKeydown"
  >
    <SnippetDocumentHead
      ref="head"
      v-model:name="name"
      v-model:secret="draft.secret.value"
      :initial-tags="draft.initialTags"
      :edit-mode="editMode"
      :needs-name="editMode && !!content.trim() && !name.trim()"
      :read-only="readOnly"
      @edit-tags="inline.editTags"
      @edit-name="inline.editName"
    />
    <Teleport v-if="inFront" to="#toolbar-doc-actions" defer>
      <SnippetEditorActions
        ref="actions"
        :edit-mode="editMode"
        :name="name"
        :content="content"
        :language="language"
        :has-content="!!content"
        :can-save="inline.canSave.value"
        :secret="draft.secret.value"
        :masked="masked"
        :snippet-id="editing.id"
        :can-compare="!!(editing.id || editing.openedPath) && !draft.secret.value"
        @compare="compareWith"
        @copy="copyAndFlash"
        @capture="draft.captureImage"
        @reveal="revealAndLayout"
        @save="saveSnippet"
        @history="showHistory = !showHistory"
        @save-as-file="saveAsFile"
      />
    </Teleport>
    <div class="doc-body">
      <div class="doc-main">
        <SnippetEditorHeader
          v-model:plain="plain"
          :chosen-language="draft.chosenLanguage.value"
          :has-preview="hasPreview"
          :language="language"
          :can-format="draft.canFormat.value"
          @update:chosen-language="inline.setLanguage"
          @format="inline.format"
        />
        <FormatToolbar
          v-if="hasPreview && editMode"
          :actions="toolbarActions"
          @action="applyAction"
        />
        <div
          class="editor-area"
          :class="{ editing: editMode }"
          @mousedown.capture="inline.onContentPointerDown"
          @dragover.capture.prevent.stop
          @drop.capture.prevent.stop="inline.dropFile"
        >
          <span v-if="!editMode && !masked" class="edit-cue" aria-hidden="true">
            {{ $t('snippetDocument.clickToEdit') }}
          </span>
          <div v-if="(!hasPreview || plain) && !masked" ref="container" class="editor"></div>
          <RenderedEditor
            v-if="hasPreview && !plain && !masked && editMode"
            ref="renderedEditor"
            v-model:content="content"
            class="editor rendered"
            :dialect="isMarkdown ? 'markdown' : 'jira'"
          />
          <template v-else-if="hasPreview && !plain && !masked">
            <JiraRendered v-if="isJira" class="editor rendered" :content="content" />
            <MarkdownRendered v-else class="editor rendered" :content="content" />
          </template>
          <SnippetSecretMask v-if="masked" />
        </div>
        <p v-if="editMode && !content.trim()" class="required-hint">
          {{ $t('snippetEditorDialog.aSnippetNeedsContentTo') }}
        </p>
        <MermaidPreview v-if="isMermaid && !masked" :code="content" @expand="draft.expandDiagram" />
        <SnippetStatusBar
          v-if="!masked"
          :content="content"
          :language="language"
          :cursor="cursor"
          :editing="editMode"
          :opened-from="editing.id ? '' : (editing.openedFrom ?? '')"
        />
      </div>
      <SnippetHistoryPanel
        v-if="showHistory && editing.id"
        :snippet-id="editing.id"
        @close="showHistory = false"
      />
    </div>
  </section>
</template>

<style scoped src="./styles/SnippetEditor.css"></style>
<style scoped src="./styles/SnippetDocument.css"></style>
