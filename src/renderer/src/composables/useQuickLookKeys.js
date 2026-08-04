// Keyboard driver for the quick look-up list. Pulled out of the component and
// unit-tested like useBackdropClose; takes plain accessors so the test drives it
// with no Vue mount.
//
// Two focus zones: 'list' (arrows navigate results) and 'preview' (arrows scroll
// the active snippet). ← and Escape share one back-out ladder — preview → list →
// collapse section → dismiss — so ← is exit navigation, not just a zone step.

/**
 * @param {object} o
 * @param {() => number} o.count           current result count
 * @param {{ value: number }} o.selected   selected index (a Vue ref, or any {value})
 * @param {(index: number) => void} o.onChoose
 * @param {() => void} o.onDismiss
 * @param {(index: number) => void} [o.onCopy]     Cmd/Ctrl+C: copy the whole selected item
 * @param {() => void} [o.onCopyLine]              Shift+Cmd/Ctrl+C: copy the active preview line
 * @param {{ value: 'list' | 'preview' }} [o.zone]  focus zone (a Vue ref, or any {value})
 * @param {() => boolean} [o.canEnterPreview]       true when the active row has a scrollable preview
 * @param {(dir: 1|-1, extend?: boolean) => void} [o.movePreview]  step the preview line
 * @param {() => boolean} [o.onExpand]  → on a non-preview row (e.g. a command): returns true if it handled it
 * @param {() => boolean} [o.onCollapse]  ← / Escape in the list (e.g. close an expanded section): true if it handled it
 * @returns {{ onKeydown: (e: KeyboardEvent) => void }}
 */
export function useQuickLookKeys({
  count,
  selected,
  onChoose,
  onDismiss,
  onCopy = () => {},
  onCopyLine = () => {},
  zone = { value: 'list' },
  canEnterPreview = () => false,
  movePreview = () => {},
  onExpand = () => false,
  onCollapse = () => false
}) {
  const clamp = (i) => Math.max(0, Math.min(i, count() - 1))
  const inPreview = () => zone.value === 'preview'

  // A live text selection in the search box copies natively; otherwise Cmd/Ctrl+C
  // copies the highlighted result, and Shift+Cmd/Ctrl+C the selected line range.
  function tryCopy(e) {
    if (!((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C'))) return false
    const t = e.target
    if (t && t.selectionStart != null && t.selectionStart !== t.selectionEnd) return true
    e.preventDefault()
    if (e.shiftKey) onCopyLine()
    else if (count() > 0) onCopy(selected.value)
    return true
  }

  // → only enters the preview from the end of the query text, so it never fights
  // the caret while the user is still editing the search.
  function caretAtEnd(e) {
    const t = e.target
    if (!t || t.selectionStart == null) return true
    return t.selectionStart === t.selectionEnd && t.selectionEnd === (t.value?.length ?? 0)
  }

  // One handler per key, so the dispatcher below stays flat (each move is either
  // list-navigation or a preview line-step depending on the zone).
  function moveOrScroll(e, dir) {
    e.preventDefault()
    // Shift extends the preview's range, as an editor does.
    if (inPreview()) movePreview(dir, e.shiftKey === true)
    else selected.value = clamp(selected.value + dir)
  }
  // → enters the snippet preview, OR hands off to onExpand (a command opens its
  // convert panel) — same key, so navigation reads the same on every row.
  function enterPreview(e) {
    if (inPreview() || !caretAtEnd(e)) return
    if (canEnterPreview()) {
      e.preventDefault()
      zone.value = 'preview'
    } else if (onExpand()) {
      e.preventDefault()
    }
  }
  // ← only exits from the start of the query, mirroring caretAtEnd for →; a
  // modifier means the field is doing its own word/line jump.
  function caretAtStart(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return false
    const t = e.target
    if (!t || t.selectionStart == null) return true
    return t.selectionStart === 0 && t.selectionEnd === 0
  }
  // Same ladder as Escape, except the search box keeps ← while its caret can move.
  function leaveOrCollapse(e) {
    if (inPreview()) {
      e.preventDefault()
      zone.value = 'list'
      return
    }
    if (onCollapse()) {
      e.preventDefault()
      return
    }
    if (!caretAtStart(e)) return
    e.preventDefault()
    onDismiss()
  }
  function commit(e) {
    e.preventDefault()
    if (count() > 0) onChoose(selected.value)
  }
  // Escape backs out one level at a time: preview → list → collapse section → dismiss.
  function back(e) {
    e.preventDefault()
    if (inPreview()) zone.value = 'list'
    else if (onCollapse()) return
    else onDismiss()
  }

  const HANDLERS = {
    ArrowDown: (e) => moveOrScroll(e, 1),
    ArrowUp: (e) => moveOrScroll(e, -1),
    ArrowRight: enterPreview,
    ArrowLeft: leaveOrCollapse,
    Enter: commit,
    Escape: back
  }

  function onKeydown(e) {
    if (tryCopy(e)) return
    HANDLERS[e.key]?.(e)
  }
  return { onKeydown }
}
