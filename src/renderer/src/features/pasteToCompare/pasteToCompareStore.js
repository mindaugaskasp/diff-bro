// Ctrl/Cmd+V paste-to-compare: the gesture, its confirmations and where the
// clipboard text lands. The pasted SIDES themselves are core comparison state —
// they are inputs to the same diff, they ride in the saved snapshot, and the
// core reads them for `hasUnsavedWork` and a disk refresh. What is separable is
// the asking.

import { defineStore } from 'pinia'
import { useDiffStore } from '../../stores/diffStore'

// A pasted side has no path, so it's never re-read from disk on focus.
const pastedSide = (side, text) => ({
  path: null,
  name: `${side === 'left' ? 'Left' : 'Right'} (pasted)`,
  content: text
})

export const usePasteToCompareStore = defineStore('pasteToCompare', {
  state: () => ({
    // null | 'enter' (asks before reading the clipboard) | 'overwrite' (before
    // replacing a full side).
    prompt: null,
    // The clipboard text held between confirm and overwrite.
    pendingText: ''
  }),
  actions: {
    // Ctrl/Cmd+V paste-to-compare. Ask before reading the clipboard.
    async request() {
      const diff = useDiffStore()
      if (this.prompt) return
      if (diff.left?.kind === 'spreadsheet' || diff.right?.kind === 'spreadsheet') {
        diff.showNotice('Paste-to-compare works with text, not a spreadsheet.')
        return
      }
      // Copied files are unambiguous — load them without asking. The prompt
      // exists for pasted TEXT, where entering paste mode is a real decision.
      if (await this.takeClipboardFiles()) return
      this.prompt = 'enter'
    },
    async confirmEnter() {
      const diff = useDiffStore()
      const text = (await window.api?.readText?.()) ?? ''
      if (!text.trim()) {
        this.prompt = null
        diff.showNotice('The clipboard is empty — nothing to paste.')
        return
      }
      // A loaded comparison: paste into its empty side, not the paste textareas
      // (which would orphan the loaded file).
      if (diff.mode === 'files' && (diff.left || diff.right)) {
        this.intoComparison(text)
      } else {
        this.intoPasteFields(text)
      }
    },
    // Routed through dropFiles so copied files land exactly like dropped ones,
    // confirm included. Returns true when the clipboard held files.
    async takeClipboardFiles() {
      const diff = useDiffStore()
      const files = ((await window.api?.readClipboardFiles?.()) ?? []).filter(Boolean)
      if (!files.length) return false
      this.prompt = null
      await diff.dropFiles(files)
      return true
    },
    // Files mode with something loaded: drop the pasted text into the empty side
    // for an immediate diff; if both sides are full, confirm before overwriting.
    intoComparison(text) {
      const diff = useDiffStore()
      if (diff.left && diff.right) {
        this.pendingText = text
        this.prompt = 'overwrite'
        return
      }
      const side = diff.left ? 'right' : 'left'
      diff[side] = pastedSide(side, text)
      diff.diffSaved = false
      this.prompt = null
    },
    // Empty state or already in paste mode: fill the first empty paste field.
    intoPasteFields(text) {
      const diff = useDiffStore()
      diff.mode = 'paste'
      const leftFull = !!(diff.pasteLeft || diff.pasteLeftFile)
      const rightFull = !!(diff.pasteRight || diff.pasteRightFile)
      if (!leftFull) {
        diff.pasteLeft = text
        this.prompt = null
      } else if (!rightFull) {
        diff.pasteRight = text
        this.prompt = null
      } else {
        this.pendingText = text
        this.prompt = 'overwrite'
      }
    },
    // Both sides were full and the user agreed to overwrite: replace the LEFT
    // side with the pasted text, keeping the right — in whichever mode.
    confirmOverwrite() {
      const diff = useDiffStore()
      const text = this.pendingText
      this.pendingText = ''
      this.prompt = null
      if (diff.mode === 'files') {
        diff.left = pastedSide('left', text)
        diff.diffSaved = false
      } else {
        diff.pasteLeft = text
      }
    },
    cancel() {
      this.pendingText = ''
      this.prompt = null
    }
  }
})
