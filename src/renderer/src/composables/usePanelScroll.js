// Arrow/Page keys scroll a tool panel once the focused field has no caret left
// to give. The launcher window is short, so a tall panel (Lines) is otherwise
// unreachable from the keyboard: the caret eats every ArrowDown and the
// scrollable ancestor never moves.

const STEP = 48

// Only a textarea can still use an up/down press — a single-line input, a
// button or a checkbox does nothing with it.
function fieldWantsIt(el, dir) {
  if (!el || el.tagName !== 'TEXTAREA' || el.selectionStart == null) return false
  return dir > 0 ? el.selectionStart < el.value.length : el.selectionStart > 0
}

const DIRECTION = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1 }

/**
 * @param {{ value: HTMLElement|null }} panel  the scroll container
 * @returns {{ onKeydown: (e: KeyboardEvent) => void }}
 */
export function usePanelScroll(panel) {
  function onKeydown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const dir = DIRECTION[e.key]
    const el = panel.value
    if (!dir || !el || fieldWantsIt(e.target, dir)) return

    const paging = e.key === 'PageDown' || e.key === 'PageUp'
    const before = el.scrollTop
    el.scrollTop += dir * (paging ? el.clientHeight * 0.9 : STEP)
    if (el.scrollTop !== before) e.preventDefault()
  }
  return { onKeydown }
}
