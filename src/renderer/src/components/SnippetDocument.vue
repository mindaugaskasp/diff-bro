<script setup>
import { reactive, ref, computed, watch } from 'vue'
import { useTabsStore } from '../stores/tabsStore'
import { useDiffStore } from '../stores/diffStore'
import { useSnippetDraft } from '../composables/useSnippetDraft'
import { useFormatToolbar } from '../composables/useFormatToolbar'
import { useSnippetEditorView } from '../composables/useSnippetEditorView'
import { useMonacoInput } from '../composables/useMonacoInput'
import { useFileTextDrop } from '../composables/useFileDrop'
import SnippetDocumentHead from './SnippetDocumentHead.vue'
import SnippetEditorHeader from './SnippetEditorHeader.vue'
import SnippetEditorActions from './SnippetEditorActions.vue'
import SnippetSecretMask from './SnippetSecretMask.vue'
import SnippetHistoryPanel from './SnippetHistoryPanel.vue'
import MermaidPreview from './MermaidPreview.vue'
import FormatToolbar from './FormatToolbar.vue'
import JiraRendered from './JiraRendered.vue'
import MarkdownRendered from './MarkdownRendered.vue'
import RenderedEditor from './RenderedEditor.vue'
import { t } from '../i18n'

const props = defineProps({ tab: { type: Object, required: true } })
const tabs = useTabsStore()
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

watch(name, (n) => tabs.setSnippetMeta(props.tab.id, { title: n.trim() }), { immediate: true })
watch(draft.isDirty, (d) => tabs.setSnippetMeta(props.tab.id, { dirty: d }), { immediate: true })

const container = ref(null)
const head = ref(null)
const readOnly = computed(() => !editMode.value)
const { reset, applySelectionEdit, layout } = useMonacoInput({
  container,
  content,
  language,
  readOnly
})
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

const showHistory = ref(false)
const compareWith = () => useDiffStore().dropSnippets([editing.id], 'left')
</script>

<template>
  <section class="snippet-doc" data-tour="snippet-editor" role="region" :aria-label="docLabel">
    <SnippetDocumentHead
      ref="head"
      v-model:name="name"
      v-model:secret="draft.secret.value"
      :initial-tags="draft.initialTags"
      :edit-mode="editMode"
      :read-only="readOnly"
    >
      <button
        v-if="editing.id && !editMode && !draft.secret.value"
        type="button"
        class="btn"
        @click="compareWith"
      >
        <span>{{ $t('snippetDocument.compareWith') }}</span>
      </button>
      <SnippetEditorActions
        ref="actions"
        :edit-mode="editMode"
        :can-format="draft.canFormat.value"
        :name="name"
        :content="content"
        :language="language"
        :has-content="!!content"
        :can-save="!!name.trim() && !!content.trim() && !draft.saving.value"
        :secret="draft.secret.value"
        :masked="masked"
        :snippet-id="editing.id"
        @format="draft.formatContent"
        @copy="copyAndFlash"
        @capture="draft.captureImage"
        @clear="reset('')"
        @reveal="revealAndLayout"
        @edit="draft.startEditing"
        @save="saveSnippet"
        @close="draft.requestClose"
        @history="showHistory = !showHistory"
      />
    </SnippetDocumentHead>
    <div class="doc-body">
      <div class="doc-main">
        <SnippetEditorHeader
          v-model:plain="plain"
          v-model:chosen-language="draft.chosenLanguage.value"
          :edit-mode="editMode"
          :has-preview="hasPreview"
          :language="language"
          :read-only="readOnly"
        />
        <FormatToolbar
          v-if="hasPreview && editMode"
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
        <div v-if="draft.confirmingDiscard.value" class="discard-confirm" role="alertdialog">
          <span>{{ $t('snippetEditorDialog.discardThisSnippetYourUnsaved') }}</span>
          <div class="discard-actions">
            <button class="btn btn-sm btn-ghost" @click="draft.keepEditing">
              {{ $t('snippetEditorDialog.keepEditing') }}
            </button>
            <button class="btn btn-sm btn-danger" @click="draft.discardDraft">
              {{ $t('snippetEditorDialog.discard') }}
            </button>
          </div>
        </div>
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
