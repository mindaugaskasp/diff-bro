<script setup>
// The same buttons viewing and editing, so none moves under the pointer.
import { t } from '../i18n'
import { computed } from 'vue'
import { useCopyFeedback } from '../composables/useCopyFeedback'
import { useCopyAsFile } from '../composables/useCopyAsFile'
import { snippetFile } from '../utils/copyAsFile'
import { useSnippetStore } from '../stores/snippetStore'
import AppIcon from './AppIcon.vue'
import ActionMenu from './ActionMenu.vue'
import { useDiffStore } from '../stores/diffStore'
import { MOD } from '../keys'
import { useClaudeStore } from '../features/claude'
import { useTabsStore } from '../stores/tabsStore'

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
  snippetId: { type: String, default: null },
  canCompare: { type: Boolean, default: false },
  canFormat: { type: Boolean, default: false }
})
// Under review, the proposal bar's Accept is the save (#121).
const claude = useClaudeStore()
const tabs = useTabsStore()
const proposed = computed(() => !!claude.reviewing[tabs.activeId])
const emit = defineEmits([
  'compare',
  'copy',
  'capture',
  'reveal',
  'save',
  'history',
  'saveAsFile',
  'format'
])

const { copied, flash } = useCopyFeedback()
const copiedText = computed(() => copied.value === 'text')
const { supported: canCopyFile, copyFile } = useCopyAsFile()
async function copyAsFile() {
  const draft = { name: props.name, content: props.content, secret: props.secret }
  if (await copyFile(snippetFile({ ...draft, lang: props.language }))) {
    useDiffStore().showNotice(t('snippetEditorActions.copiedAsFile'))
  }
}
// Mermaid's formatter repairs pasted damage; it does not pretty-print.
const formatItem = computed(() =>
  props.language === 'mermaid'
    ? { action: 'format', label: t('snippetEditorActions.repair'), icon: 'wrench' }
    : { action: 'format', label: t('snippetEditorActions.format'), icon: 'braces' }
)
const menuItems = computed(() => {
  const off = !props.hasContent || props.secret
  return [
    { ...formatItem.value, disabled: !props.canFormat },
    ...(canCopyFile.value
      ? [
          {
            action: 'copy-file',
            label: t('snippetEditorActions.copyAsFile'),
            icon: 'clipboard',
            disabled: off
          }
        ]
      : []),
    {
      action: 'save-file',
      label: t('snippetEditorActions.saveAsFile'),
      icon: 'save',
      keys: `${MOD}+Alt+S`,
      disabled: off
    }
  ]
})
const onMenuAction = (action) =>
  action === 'copy-file' ? copyAsFile() : emit(action === 'format' ? 'format' : 'saveAsFile')

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
    v-if="canCompare"
    type="button"
    class="btn btn-sm btn-square"
    :aria-label="$t('snippetDocument.compareWith')"
    :data-tip="$t('snippetDocument.compareWith')"
    @click="emit('compare')"
  >
    <AppIcon name="compare" />
  </button>
  <button
    v-if="secret"
    class="btn btn-sm btn-square"
    :aria-label="masked ? $t('snippetEditorActions.show') : $t('snippetEditorActions.hide')"
    :data-tip="
      masked
        ? $t('snippetEditorActions.showTheContents')
        : $t('snippetEditorActions.hideTheContentsAgain')
    "
    @click="emit('reveal')"
  >
    <AppIcon :name="masked ? 'eye' : 'eye-off'" />
  </button>
  <!-- aria-label is the STABLE name: only the glyph swaps for the flash. -->
  <button
    class="btn btn-sm btn-square"
    :class="{ copied: copiedText }"
    :disabled="!hasContent"
    :data-tip="copiedText ? $t('common.copied') : copyTip"
    :aria-label="$t('common.copy')"
    @click="emit('copy')"
  >
    <AppIcon :name="copiedText ? 'check' : 'copy'" />
  </button>
  <ActionMenu
    :label="$t('snippetEditorActions.moreActions')"
    :items="menuItems"
    trigger-class="btn btn-icon"
    @pick="onMenuAction"
  />
  <button
    v-if="hasHistory"
    class="btn btn-sm btn-square"
    :aria-label="$t('snippetEditorActions.history')"
    :data-tip="$t('snippetEditorActions.historyTip')"
    @click="emit('history')"
  >
    <AppIcon name="clock" />
  </button>
  <!-- Never for a secret: the store refuses it too. -->
  <button
    v-if="!secret && isMermaid"
    class="btn btn-sm btn-square"
    :disabled="editMode"
    :aria-label="$t('snippetEditorActions.capture')"
    :data-tip="$t('snippetEditorActions.aPictureOfThisSnippet')"
    @click="emit('capture')"
  >
    <AppIcon name="image" />
  </button>
  <button
    v-if="!proposed"
    class="btn btn-sm btn-primary"
    data-tour="snippet-save"
    :disabled="!canSave"
    :aria-label="$t('common.save')"
    @click="emit('save')"
  >
    {{ $t('common.save') }}
  </button>
</template>

<style scoped src="./styles/SnippetEditorActions.css"></style>
