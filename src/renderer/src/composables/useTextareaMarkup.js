import { nextTick } from 'vue'

// The formatting toolbar's other half. useMonacoInput.applySelectionEdit drives
// the main editor; the launcher writes into a plain textarea (Monaco would cost
// the instant summon), and the markup transforms themselves are marker-agnostic
// — they take whole text plus offsets and hand back the same. So this is the
// only piece the launcher was missing.

/**
 * @param {import('vue').Ref<HTMLTextAreaElement|null>} el
 * @param {import('vue').Ref<string>} text  the bound body
 * @returns {{ applySelectionEdit: (transform: (m: {text: string, start: number, end: number}) => ({text: string, start: number, end: number}|null)) => void }}
 */
export function useTextareaMarkup(el, text) {
  function applySelectionEdit(transform) {
    const node = el.value
    if (!node) return
    const next = transform({
      text: text.value,
      start: node.selectionStart ?? text.value.length,
      end: node.selectionEnd ?? text.value.length
    })
    if (!next) return
    text.value = next.text
    // The caret belongs INSIDE what was just wrapped, so typing continues there
    // rather than after the markers — and it has to wait for the v-model write
    // to reach the DOM, or the range lands in the old string.
    nextTick(() => {
      node.focus()
      node.setSelectionRange(next.start, next.end)
    })
  }
  return { applySelectionEdit }
}
