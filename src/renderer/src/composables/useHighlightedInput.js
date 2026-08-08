import { computed, ref } from 'vue'
import { miniLines } from '../utils/miniHighlight'

// Syntax colour behind an editable textarea, which cannot paint coloured runs
// itself: a transparent-text textarea over a <pre> of miniLines() output. The
// two stay registered only while both resolve the SAME metrics — one font, size
// and line-height, and `white-space: pre` so neither soft-wraps alone.

// An empty <div> collapses to no height, which rides the overlay up by one line
// for every blank line in the body. A zero-width space gives the box back
// without shifting a glyph.
export const ZWSP = '\u200B'

// Past this the pane is a wall of text nobody is reading in a launcher, and
// re-tokenizing it on every keystroke is felt. Colour is the thing to drop.
const MAX_CHARS = 20000

/**
 * @param {object} o
 * @param {{ value: string }} o.text      the textarea's bound value
 * @param {{ value: string }} o.language  resolved Monaco language id
 * @returns {object}
 */
export function useHighlightedInput({ text, language }) {
  const textareaEl = ref(null)
  const overlayEl = ref(null)
  const composing = ref(false)

  const isPlain = computed(() => composing.value || (text.value?.length ?? 0) > MAX_CHARS)

  const lines = computed(() => {
    if (isPlain.value) return []
    return miniLines(text.value, language.value).map((spans) =>
      spans.length === 1 && spans[0].text === '' ? [{ text: ZWSP, role: '' }] : spans
    )
  })

  function onScroll() {
    const ta = textareaEl.value
    const hl = overlayEl.value
    if (!ta || !hl) return
    hl.scrollTop = ta.scrollTop
    hl.scrollLeft = ta.scrollLeft
  }

  const onCompositionStart = () => {
    composing.value = true
  }
  const onCompositionEnd = () => {
    composing.value = false
  }

  return { textareaEl, overlayEl, lines, isPlain, onScroll, onCompositionStart, onCompositionEnd }
}
