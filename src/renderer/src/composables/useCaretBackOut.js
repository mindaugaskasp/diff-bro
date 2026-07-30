// ← leaves an inline panel only when the caret has nowhere left to go, so a
// field keeps the key while it can still use it. A composable, not inline, so
// the guard is unit-tested — it regressed silently once already.

const isTextField = (el) =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.selectionStart != null

/**
 * @param {() => void} onBack
 * @returns {{ onKeydown: (e: KeyboardEvent) => void }}
 */
export function useCaretBackOut(onBack) {
  function onKeydown(e) {
    if (e.key !== 'ArrowLeft' || e.metaKey || e.ctrlKey || e.altKey) return
    const el = e.target
    if (isTextField(el) && !(el.selectionStart === 0 && el.selectionEnd === 0)) return
    e.preventDefault()
    onBack()
  }
  return { onKeydown }
}
