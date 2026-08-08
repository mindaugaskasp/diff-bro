import { computed } from 'vue'
import { JIRA_ACTIONS, applyJiraAction } from '../utils/jiraMarkup'
import { MARKDOWN_ACTIONS, applyMarkdownAction } from '../utils/markdownMarkup'

// The Jira/Markdown markup toolbar: which action set is live, and applying one
// to the selection. Two languages, one row — the only thing that differs is
// which table and which transform.

/**
 * @param {object} o
 * @param {{ value: boolean }} o.isMarkdown
 * @param {(edit: object) => void} o.applySelectionEdit
 * @returns {{ actions: object, applyAction: (id: string) => void }}
 */
export function useFormatToolbar({ isMarkdown, applySelectionEdit }) {
  const actions = computed(() => (isMarkdown.value ? MARKDOWN_ACTIONS : JIRA_ACTIONS))
  const applyAction = (id) =>
    applySelectionEdit((sel) =>
      isMarkdown.value ? applyMarkdownAction(id, sel) : applyJiraAction(id, sel)
    )
  return { actions, applyAction }
}
