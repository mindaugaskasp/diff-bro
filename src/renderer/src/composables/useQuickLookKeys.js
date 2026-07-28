// Keyboard driver for the quick look-up list. Pulled out of the component and
// unit-tested like useBackdropClose; takes plain accessors so the test drives it
// with no Vue mount.

/**
 * @param {object} o
 * @param {() => number} o.count           current result count
 * @param {{ value: number }} o.selected   selected index (a Vue ref, or any {value})
 * @param {(index: number) => void} o.onChoose
 * @param {() => void} o.onDismiss
 * @param {(index: number) => void} [o.onCopy]
 * @returns {{ onKeydown: (e: KeyboardEvent) => void }}
 */
export function useQuickLookKeys({ count, selected, onChoose, onDismiss, onCopy = () => {} }) {
  const clamp = (i) => Math.max(0, Math.min(i, count() - 1))

  // A live text selection in the search box copies natively; otherwise Cmd/Ctrl+C
  // copies the highlighted result. Returns true when it's the copy combo.
  function tryCopy(e) {
    if (!((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C'))) return false
    const t = e.target
    if (t && t.selectionStart != null && t.selectionStart !== t.selectionEnd) return true
    e.preventDefault()
    if (count() > 0) onCopy(selected.value)
    return true
  }

  function onKeydown(e) {
    if (tryCopy(e)) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        selected.value = clamp(selected.value + 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        selected.value = clamp(selected.value - 1)
        break
      case 'Enter':
        e.preventDefault()
        if (count() > 0) onChoose(selected.value)
        break
      case 'Escape':
        e.preventDefault()
        onDismiss()
        break
    }
  }
  return { onKeydown }
}
