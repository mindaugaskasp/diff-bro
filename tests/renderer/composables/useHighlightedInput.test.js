import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import {
  useHighlightedInput,
  ZWSP
} from '../../../src/renderer/src/composables/useHighlightedInput'

const setup = (body = '', lang = 'sql') => {
  const text = ref(body)
  const language = ref(lang)
  return { text, language, hl: useHighlightedInput({ text, language }) }
}

// The overlay only works while both layers agree on where every line sits. Each
// test here is one way they were found to drift.
describe('useHighlightedInput', () => {
  it('tokenizes the body into the shared syntax roles', () => {
    const { hl } = setup('SELECT id FROM t;')
    expect(hl.lines.value).toHaveLength(1)
    expect(hl.lines.value[0].some((s) => s.role === 'keyword')).toBe(true)
  })

  it('gives one rendered line per textarea line', () => {
    const { hl } = setup('a\nb\nc', 'plaintext')
    expect(hl.lines.value).toHaveLength(3)
  })

  // A textarea ending in \n shows an empty final line; an empty div collapses to
  // no height, so without this the overlay rides up by one line at the bottom.
  it('keeps a trailing blank line occupying a box', () => {
    const { hl } = setup('a\n', 'plaintext')
    expect(hl.lines.value).toHaveLength(2)
    expect(hl.lines.value[1]).toEqual([{ text: ZWSP, role: '' }])
  })

  it('gives every interior blank line a box too', () => {
    const { hl } = setup('a\n\nb', 'plaintext')
    expect(hl.lines.value[1]).toEqual([{ text: ZWSP, role: '' }])
  })

  it('never loses or invents a character of the body', () => {
    const body = "SELECT 'x'\nFROM t\n  WHERE a = 1;"
    const { hl } = setup(body)
    const rebuilt = hl.lines.value
      .map((spans) =>
        spans
          .map((s) => s.text)
          .join('')
          .replace(ZWSP, '')
      )
      .join('\n')
    expect(rebuilt).toBe(body)
  })

  it('mirrors both scroll axes onto the overlay', () => {
    const { hl } = setup('SELECT 1;')
    hl.textareaEl.value = { scrollTop: 42, scrollLeft: 17 }
    hl.overlayEl.value = { scrollTop: 0, scrollLeft: 0 }
    hl.onScroll()
    expect(hl.overlayEl.value).toMatchObject({ scrollTop: 42, scrollLeft: 17 })
  })

  it('survives a scroll before either element is mounted', () => {
    const { hl } = setup()
    expect(() => hl.onScroll()).not.toThrow()
  })

  // Transparent text means an in-progress IME composition is invisible until it
  // commits, so the overlay stands down for the duration.
  it('drops the overlay while composing and restores it after', () => {
    const { hl } = setup('SELECT 1;')
    expect(hl.isPlain.value).toBe(false)
    hl.onCompositionStart()
    expect(hl.isPlain.value).toBe(true)
    expect(hl.lines.value).toEqual([])
    hl.onCompositionEnd()
    expect(hl.isPlain.value).toBe(false)
    expect(hl.lines.value.length).toBe(1)
  })

  it('stops tokenizing a body past the cap rather than stalling on every key', () => {
    const { hl, text } = setup('SELECT 1;')
    text.value = 'SELECT 1;'.repeat(4000)
    expect(hl.isPlain.value).toBe(true)
    expect(hl.lines.value).toEqual([])
  })

  it('paints nothing for plaintext, so prose is not speckled', () => {
    const { hl } = setup('just some notes', 'plaintext')
    expect(hl.lines.value[0].every((s) => s.role === '')).toBe(true)
  })
})
