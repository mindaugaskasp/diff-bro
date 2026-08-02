// Dragging a snippet into the diff pane. Pulled out of SnippetRow.vue so the
// two rules that matter are testable without a real drag: what goes ON the drag
// (an id, never the body) and what is accepted OFF one.

import { isSecret } from '../utils/secretSnippet'
import { DRAG_TYPE, dragIdsFrom } from '../utils/snippetSource'

export function useSnippetDrag() {
  /**
   * @param {DragEvent} e
   * @param {import('../types').SnippetEntry} entry
   */
  function startDrag(e, entry) {
    // A masked snippet exists so its plaintext is not on screen, and a diff pane
    // is the largest screen there is.
    if (isSecret(entry)) {
      e.preventDefault?.()
      return
    }
    if (!e.dataTransfer) return
    // The id alone: a drop target we do not own can read this payload.
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify([entry.id]))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return {
    startDrag,
    snippetIdsIn: dragIdsFrom,
    isSnippetDrag: (transfer) => dragIdsFrom(transfer).length > 0
  }
}
