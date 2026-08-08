import { computed, ref } from 'vue'
import { completionFor } from '../utils/nameComplete'

// Inline completion for a snippet name. The ghost is NEVER part of the input's
// value — an overlay behind the field draws it — so selection, copy and the
// saved name can only contain what was typed or accepted. Escape is neither an
// accept nor a dismiss: it already closes the compose panel.

/**
 * @param {object} o
 * @param {{ value: string }} o.name    the field's bound value
 * @param {{ value: string[] }} o.names names to complete against
 * @param {{ value: boolean }} [o.readonly] when true there is nothing to offer
 * @returns {object}
 */
export function useNameComplete({ name, names, readonly }) {
  const inputEl = ref(null)
  const overlayEl = ref(null)

  // Emptied at the source, not hidden in the template: a read-only input is
  // still focusable and still fires keydown, so a merely-hidden ghost would
  // accept into the value.
  const ghost = computed(() => (readonly?.value ? '' : completionFor(name.value, names.value)))

  const isCaretAtEnd = () => {
    const el = inputEl.value
    if (!el) return false
    const end = name.value.length
    return el.selectionStart === end && el.selectionEnd === end
  }

  // insertText goes through the browser's editing pipeline, so the accept joins
  // the undo stack and Cmd+Z gives back what was typed. Writing to the model
  // directly clears that stack, taking the user's own typing with it. It also
  // raises `input`, which drives v-model — so on success we must NOT write too.
  function accept() {
    const el = inputEl.value
    const suffix = ghost.value
    if (el?.ownerDocument?.execCommand) {
      el.focus?.()
      if (el.ownerDocument.execCommand('insertText', false, suffix)) return
    }
    name.value += suffix
  }

  // Tab accepts wherever the caret is; → only from the end, where it would
  // otherwise do nothing anyway. A modifier means the user meant something else
  // — Shift+Tab is how they go BACK — and Tab is a candidate key in CJK IMEs,
  // so a composition in flight owns it.
  const isAcceptKey = (e) => {
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return false
    if (e.isComposing || e.keyCode === 229) return false
    return e.key === 'Tab' || (e.key === 'ArrowRight' && isCaretAtEnd())
  }

  function onKeydown(e) {
    if (!ghost.value || !isAcceptKey(e)) return
    accept()
    e.preventDefault()
  }

  // A single-line input scrolls horizontally once the text overflows; the
  // overlay has to follow or the ghost detaches from the caret.
  function onScroll() {
    const el = inputEl.value
    const overlay = overlayEl.value
    if (!el || !overlay) return
    overlay.scrollLeft = el.scrollLeft
  }

  return { inputEl, overlayEl, ghost, onKeydown, onScroll }
}
