import { computed, nextTick, watch } from 'vue'
import { useTabsStore } from '../stores/tabsStore'
import { useUiStore } from '../stores/uiStore'
import { useInlineEdit } from './useInlineEdit'

/**
 * The snippet document's ways into editing (content, name, tags, Format,
 * syntax, a dropped file), its way out (Escape), and ⌘S for the tab in front.
 * @param {object} args
 * @param {ReturnType<import('./useSnippetDraft').useSnippetDraft>} args.draft
 * @param {{ id: string }} args.tab
 * @param {import('vue').Ref<{ focusName: () => void, focusTags: () => void }|null>} args.head
 * @param {() => void} args.save
 * @param {(e: DragEvent) => void} args.onDropFile
 */
export function useSnippetInlineEdit({ draft, tab, head, save, onDropFile }) {
  const tabs = useTabsStore()
  const ui = useUiStore()
  const { onContentPointerDown, onKeydown } = useInlineEdit({
    editMode: draft.editMode,
    isDirty: draft.isDirty,
    masked: draft.masked,
    isNew: draft.isNew
  })

  const canSave = computed(
    () =>
      !!draft.name.value.trim() &&
      !!draft.content.value.trim() &&
      !draft.saving.value &&
      (draft.isDirty.value || draft.isNew.value)
  )

  async function editThen(focus) {
    draft.startEditing()
    await nextTick()
    focus?.()
  }

  watch(
    () => ui.snippetSaveRequest,
    () => tabs.activeId === tab.id && canSave.value && save()
  )

  return {
    canSave,
    onKeydown,
    onContentPointerDown,
    editName: () => editThen(() => head.value?.focusName()),
    editTags: () => editThen(() => head.value?.focusTags()),
    format() {
      draft.startEditing()
      draft.formatContent()
    },
    setLanguage(value) {
      draft.startEditing()
      draft.chosenLanguage.value = value
    },
    dropFile(e) {
      if (draft.masked.value) return
      draft.startEditing()
      onDropFile(e)
    }
  }
}
