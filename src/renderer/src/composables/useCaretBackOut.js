// ← backs out of an inline panel to the list — but only when the caret has
// nowhere left to go. Inside a text field with the caret past 0, or with a live
// selection, the key belongs to the field and must pass through. Pulled out of
// the component and unit-tested like useBackdropClose (CLAUDE.md): this guard is
// exactly the kind that silently regresses when a component is refactored.

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
