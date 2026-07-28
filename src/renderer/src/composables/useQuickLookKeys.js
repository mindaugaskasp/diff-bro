// Keyboard driver for the quick look-up list. Pulled out of the component and
// unit-tested like useBackdropClose; takes plain accessors so the test drives it
// with no Vue mount.
//
// Two focus zones: 'list' (arrows navigate results) and 'preview' (arrows scroll
// the active snippet). Right/left arrows step between them; Escape backs out one
// level (preview → list → dismiss).

/**
 * @param {object} o
 * @param {() => number} o.count           current result count
 * @param {{ value: number }} o.selected   selected index (a Vue ref, or any {value})
 * @param {(index: number) => void} o.onChoose
 * @param {() => void} o.onDismiss
 * @param {(index: number) => void} [o.onCopy]
 * @param {{ value: 'list' | 'preview' }} [o.zone]  focus zone (a Vue ref, or any {value})
 * @param {() => boolean} [o.canEnterPreview]       true when the active row has a scrollable preview
 * @param {(dir: 1 | -1) => void} [o.scrollPreview] scroll the preview one step
 * @returns {{ onKeydown: (e: KeyboardEvent) => void }}
 */
export function useQuickLookKeys({
  count,
  selected,
  onChoose,
  onDismiss,
  onCopy = () => {},
  zone = { value: 'list' },
  canEnterPreview = () => false,
  scrollPreview = () => {}
}) {
  const clamp = (i) => Math.max(0, Math.min(i, count() - 1))
  const inPreview = () => zone.value === 'preview'

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

  // → only enters the preview from the end of the query text, so it never fights
  // the caret while the user is still editing the search.
  function caretAtEnd(e) {
    const t = e.target
    if (!t || t.selectionStart == null) return true
    return t.selectionStart === t.selectionEnd && t.selectionEnd === (t.value?.length ?? 0)
  }

  // One handler per key, so the dispatcher below stays flat (each move is either
  // list-navigation or preview-scroll depending on the zone).
  function moveOrScroll(e, dir) {
    e.preventDefault()
    if (inPreview()) scrollPreview(dir)
    else selected.value = clamp(selected.value + dir)
  }
  function enterPreview(e) {
    if (inPreview() || !caretAtEnd(e) || !canEnterPreview()) return
    e.preventDefault()
    zone.value = 'preview'
  }
  function leavePreview(e) {
    if (!inPreview()) return
    e.preventDefault()
    zone.value = 'list'
  }
  function commit(e) {
    e.preventDefault()
    if (count() > 0) onChoose(selected.value)
  }
  function back(e) {
    e.preventDefault()
    if (inPreview()) zone.value = 'list'
    else onDismiss()
  }

  const HANDLERS = {
    ArrowDown: (e) => moveOrScroll(e, 1),
    ArrowUp: (e) => moveOrScroll(e, -1),
    ArrowRight: enterPreview,
    ArrowLeft: leavePreview,
    Enter: commit,
    Escape: back
  }

  function onKeydown(e) {
    if (tryCopy(e)) return
    HANDLERS[e.key]?.(e)
  }
  return { onKeydown }
}
