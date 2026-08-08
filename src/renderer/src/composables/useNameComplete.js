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
 * @returns {object}
 */
export function useNameComplete({ name, names }) {
  const inputEl = ref(null)
  const overlayEl = ref(null)

  const ghost = computed(() => completionFor(name.value, names.value))

  const isCaretAtEnd = () => {
    const el = inputEl.value
    if (!el) return false
    const end = name.value.length
    return el.selectionStart === end && el.selectionEnd === end
  }

  function accept() {
    if (!ghost.value) return false
    name.value += ghost.value
    return true
  }

  // Tab accepts wherever the caret is; → only from the end, where it would
  // otherwise do nothing anyway.
  const isAcceptKey = (e) => e.key === 'Tab' || (e.key === 'ArrowRight' && isCaretAtEnd())

  function onKeydown(e) {
    if (ghost.value && isAcceptKey(e) && accept()) e.preventDefault()
  }

  // A single-line input scrolls horizontally once the text overflows; the
  // overlay has to follow or the ghost detaches from the caret.
  function onScroll() {
    const el = inputEl.value
    const overlay = overlayEl.value
    if (!el || !overlay) return
    overlay.scrollLeft = el.scrollLeft
  }

  return { inputEl, overlayEl, ghost, onKeydown, onScroll, accept }
}
