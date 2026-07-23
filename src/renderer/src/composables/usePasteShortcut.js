import { onBeforeUnmount, onMounted } from 'vue'

// True for fields where Ctrl/Cmd+V should do a NORMAL paste — we must never
// hijack it there (typing in the paste textareas, search boxes, dialog inputs).
export function isEditableTarget(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable === true
}

// The paste chord: Ctrl+V (or Cmd+V on macOS), no other modifiers.
export function isPasteChord(e) {
  const mod = e.metaKey || e.ctrlKey
  return mod && !e.altKey && !e.shiftKey && (e.key === 'v' || e.key === 'V')
}

// Ctrl/Cmd+V while focus is NOT in a text field is a "paste to compare" gesture:
// it runs `onPaste`. When focus IS in an input/textarea the browser's normal
// paste is left completely alone. Deliberately a renderer-only gesture, NOT a
// menu accelerator — a global accelerator would fire regardless of focus and
// break pasting into fields.
export function usePasteShortcut(onPaste) {
  function handler(e) {
    if (!isPasteChord(e)) return
    if (isEditableTarget(e.target) || isEditableTarget(document.activeElement)) return
    e.preventDefault()
    onPaste()
  }
  onMounted(() => window.addEventListener('keydown', handler))
  onBeforeUnmount(() => window.removeEventListener('keydown', handler))
}
