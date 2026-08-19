import { computed } from 'vue'
import { JIRA_ACTIONS, applyJiraAction } from '../utils/jiraMarkup'
import { MARKDOWN_ACTIONS, applyMarkdownAction } from '../utils/markdownMarkup'

// The Jira/Markdown markup toolbar: which action set is live, and applying one
// to whichever editor is on screen. Two languages and two editors, one row.
//
// The editors take an action differently and cannot be unified: Monaco edits the
// SOURCE at a selection offset, while the rendered view edits the DOM, because an
// offset into rendered text does not map onto one into markup (`**bold**` is
// eight characters and shows four).

/**
 * @param {object} o
 * @param {{ value: boolean }} o.isMarkdown
 * @param {(edit: object) => void} o.applySelectionEdit    Monaco's source edit
 * @param {{ value: boolean }} [o.plain]                   which editor is on screen
 * @param {{ value: { applyFormat: (id: string) => void } | null }} [o.rendered]
 * @returns {{ actions: object, applyAction: (id: string) => void }}
 */
export function useFormatToolbar({ isMarkdown, applySelectionEdit, plain, rendered }) {
  const actions = computed(() => (isMarkdown.value ? MARKDOWN_ACTIONS : JIRA_ACTIONS))

  const applyToSource = (id) =>
    applySelectionEdit((sel) =>
      isMarkdown.value ? applyMarkdownAction(id, sel) : applyJiraAction(id, sel)
    )

  const applyAction = (id) => {
    if (plain && !plain.value) return void rendered?.value?.applyFormat(id)
    applyToSource(id)
  }

  return { actions, applyAction }
}
