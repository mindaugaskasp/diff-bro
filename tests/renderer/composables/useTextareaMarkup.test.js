import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { useTextareaMarkup } from '../../../src/renderer/src/composables/useTextareaMarkup'
import { applyMarkdownAction } from '../../../src/renderer/src/utils/markdownMarkup'

// The launcher writes into a plain textarea, so the markup transforms — which
// take whole text plus offsets — need the offsets read off the element and the
// new selection written back to it. Getting the second half wrong is invisible
// until you type: the caret lands after the markers instead of inside them.

const harness = (value, [start, end]) => {
  const text = ref(value)
  const node = {
    value,
    selectionStart: start,
    selectionEnd: end,
    focus: vi.fn(),
    setSelectionRange: vi.fn()
  }
  return { text, node, ...useTextareaMarkup(ref(node), text) }
}

describe('useTextareaMarkup', () => {
  it('wraps the selection and leaves the caret inside it', async () => {
    const h = harness('release notes', [0, 7])
    h.applySelectionEdit((m) => applyMarkdownAction('bold', m))
    expect(h.text.value).toBe('**release** notes')

    await nextTick()
    expect(h.node.setSelectionRange).toHaveBeenCalledWith(2, 9)
    expect(h.node.focus).toHaveBeenCalled()
  })

  it('acts at the caret when nothing is selected', () => {
    const h = harness('note', [4, 4])
    h.applySelectionEdit((m) => applyMarkdownAction('bold', m))
    expect(h.text.value).toBe('note****')
  })

  it('leaves the body alone when the transform declines', () => {
    const h = harness('note', [0, 4])
    h.applySelectionEdit(() => null)
    expect(h.text.value).toBe('note')
  })

  it('does nothing at all without a textarea to read', () => {
    const text = ref('note')
    const { applySelectionEdit } = useTextareaMarkup(ref(null), text)
    expect(() => applySelectionEdit(() => ({ text: 'x', start: 0, end: 1 }))).not.toThrow()
    expect(text.value).toBe('note')
  })

  // A textarea that has never been focused reports no selection at all.
  it('falls back to the end of the body when the element reports no selection', () => {
    const text = ref('note')
    const node = { selectionStart: null, selectionEnd: null, focus() {}, setSelectionRange() {} }
    const { applySelectionEdit } = useTextareaMarkup(ref(node), text)
    applySelectionEdit((m) => {
      expect([m.start, m.end]).toEqual([4, 4])
      return applyMarkdownAction('bold', m)
    })
    expect(text.value).toBe('note****')
  })
})
