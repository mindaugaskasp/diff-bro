// Keyboard driver for the quick look-up list. Pulled out of the component and
// unit-tested like useBackdropClose; takes plain accessors so the test drives it
// with no Vue mount.

// Modifier chords are checked before the key table, which is keyed by `e.key`
// and so cannot express one.
function tryChord(e, key, run) {
  // altKey is excluded because AltGr reports as Ctrl+Alt on European layouts.
  if (e.altKey || !((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === key)) return false
  e.preventDefault()
  run()
  return true
}

// A live text selection in the search box copies natively; otherwise Cmd/Ctrl+C
// copies the highlighted result.
function copyChord({ count, selected, onCopy }) {
  return (e) => {
    if (!((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C'))) return false
    const t = e.target
    if (t && t.selectionStart != null && t.selectionStart !== t.selectionEnd) return true
    e.preventDefault()
    if (count() > 0) onCopy(selected.value)
    return true
  }
}

/**
 * @param {object} o
 * @param {() => number} o.count           current result count
 * @param {{ value: number }} o.selected   selected index (a Vue ref, or any {value})
 * @param {(index: number) => void} o.onChoose   Enter: a snippet opens the editor sheet
 * @param {() => void} o.onDismiss
 * @param {(index: number) => void} [o.onCopy]  Cmd/Ctrl+C: copy the whole selected item
 * @param {(index: number) => void} [o.onOpen]  Cmd/Ctrl+Enter: open it in the main window
 * @param {() => void} [o.onNew]                Cmd/Ctrl+N: start a new snippet
 * @param {() => boolean} [o.onExpand]  → on a tools row or a tool: true if it handled it
 * @returns {{ onKeydown: (e: KeyboardEvent) => void }}
 */
export function useQuickLookKeys({
  count,
  selected,
  onChoose,
  onDismiss,
  onCopy = () => {},
  onOpen = () => {},
  onNew = () => {},
  onExpand = () => false
}) {
  const clamp = (i) => Math.max(0, Math.min(i, count() - 1))
  const tryCopy = copyChord({ count, selected, onCopy })

  // → drills in only from the end of the query, so it never fights the caret.
  function caretAtEnd(e) {
    const t = e.target
    if (!t || t.selectionStart == null) return true
    return t.selectionStart === t.selectionEnd && t.selectionEnd === (t.value?.length ?? 0)
  }
  function move(e, dir) {
    e.preventDefault()
    selected.value = clamp(selected.value + dir)
  }
  function expand(e) {
    if (caretAtEnd(e) && onExpand()) e.preventDefault()
  }
  function commit(e) {
    e.preventDefault()
    if (count() === 0) return
    if (e.metaKey || e.ctrlKey) onOpen(selected.value)
    else onChoose(selected.value)
  }
  function leave(e) {
    e.preventDefault()
    onDismiss()
  }

  const HANDLERS = {
    ArrowDown: (e) => move(e, 1),
    ArrowUp: (e) => move(e, -1),
    ArrowRight: expand,
    Enter: commit,
    Escape: leave
  }

  function onKeydown(e) {
    // Creating needs no results, so Cmd/Ctrl+N fires on an empty list too.
    if (tryCopy(e) || tryChord(e, 'n', onNew)) return
    HANDLERS[e.key]?.(e)
  }
  return { onKeydown }
}
