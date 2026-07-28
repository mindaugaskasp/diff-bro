import { onBeforeUnmount, onMounted } from 'vue'

// Fields where Ctrl/Cmd+V must do a normal paste, never be hijacked.
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

// Ctrl/Cmd+V outside a text field runs `onPaste`. Renderer-only, NOT a menu
// accelerator — a global one would fire regardless of focus and break field paste.
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
