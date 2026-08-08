// Dragging a snippet into the diff pane. Pulled out of SnippetRow.vue so the
// two rules that matter are testable without a real drag: what goes ON the drag
// (an id, never the body) and what is accepted OFF one.

import { isSecret } from '../utils/secretSnippet'
import { DRAG_TYPE, dragIdsFrom, setRowDragPayload } from '../utils/snippetSource'

// dragenter/dragover see a PROTECTED drag data store: `types` is readable but
// getData() returns "". A guard that reads the payload therefore never fires on
// a real drag, so the enter path asks the types and nothing else.
export const isSnippetDragType = (transfer) => Array.from(transfer?.types ?? []).includes(DRAG_TYPE)

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
    // The id alone: a drop target we do not own can read this payload.
    setRowDragPayload(e.dataTransfer, DRAG_TYPE, [entry.id])
  }

  return {
    startDrag,
    snippetIdsIn: dragIdsFrom,
    isSnippetDragType,
    isSnippetDrag: (transfer) => dragIdsFrom(transfer).length > 0
  }
}
