import { describe, it, expect } from 'vitest'
import {
  MARKDOWN_ACTIONS,
  applyMarkdownAction
} from '../../../src/renderer/src/utils/markdownMarkup'
import { createTranslator } from '../../../src/shared/i18n'

// Selection [start,end) over `text`.
const model = (text, start, end = start) => ({ text, start, end })
const apply = (id, m) => applyMarkdownAction(id, m)
const t = createTranslator('en')

describe('MARKDOWN_ACTIONS', () => {
  it('every action has an id + label key and an icon or a text label', () => {
    for (const a of MARKDOWN_ACTIONS) {
      expect(typeof a.id).toBe('string')
      expect(t(a.labelKey), a.id).not.toBe(a.labelKey)
      expect(!!a.icon || !!a.text).toBe(true)
    }
  })

  // The reason label and syntax are separate fields: vue-i18n reads `|` as a
  // plural separator and `{…}` as interpolation, so a syntax example that went
  // through the catalogue would come back mangled or empty.
  it('keeps the syntax example out of the catalogue, verbatim', () => {
    const byId = Object.fromEntries(MARKDOWN_ACTIONS.map((a) => [a.id, a]))
    expect(byId.link.syntax).toBe('[text](url)')
    expect(byId.bold.syntax).toBe('**text**')
    expect(byId.codeblock.syntax).toBe('```')
    for (const a of MARKDOWN_ACTIONS) expect(a.syntax, a.id).toBeTruthy()
  })
})

describe('applyMarkdownAction', () => {
  it('wraps a selection in ** and toggles it back off', () => {
    const bolded = apply('bold', model('say hi', 4, 6))
    expect(bolded.text).toBe('say **hi**')
    const plain = apply('bold', model(bolded.text, bolded.start, bolded.end))
    expect(plain.text).toBe('say hi')
  })

  it('wraps italic and inline code', () => {
    expect(apply('italic', model('hi', 0, 2)).text).toBe('*hi*')
    expect(apply('code', model('hi', 0, 2)).text).toBe('`hi`')
  })

  it('sets a heading marker and replaces any existing one', () => {
    const h1 = apply('h1', model('Title', 0))
    expect(h1.text).toBe('# Title')
    expect(apply('h2', model(h1.text, 0)).text).toBe('## Title')
  })

  it('prefixes each line for bullet and numbered lists', () => {
    expect(apply('bullet', model('a\nb', 0, 3)).text).toBe('- a\n- b')
    expect(apply('numbered', model('a\nb', 0, 3)).text).toBe('1. a\n1. b')
  })

  it('wraps a fenced code block around the selection', () => {
    expect(apply('codeblock', model('x = 1', 0, 5)).text).toBe('```\nx = 1\n```')
  })

  it('builds a link from a selection, caret landing in the url slot', () => {
    const linked = apply('link', model('docs', 0, 4))
    expect(linked.text).toBe('[docs]()')
    expect(linked.start).toBe(linked.text.length - 1)
  })

  it('inserts a link placeholder with "text" selected when nothing is selected', () => {
    const linked = apply('link', model('', 0))
    expect(linked.text).toBe('[text](url)')
    expect(linked.text.slice(linked.start, linked.end)).toBe('text')
  })

  it('returns null for an unknown id', () => {
    expect(apply('nope', model('x', 0))).toBeNull()
  })
})

// The four the toolbar gained. Each one is offered only because
// markdownRender.js renders it — the toolbar and the live preview must never
// disagree about what the language is.
describe('applyMarkdownAction — strikethrough, tasks, nesting, tables', () => {
  const at = (text, start, end = start) => ({ text, start, end })

  it('wraps a selection in ~~, and unwraps it again', () => {
    const on = applyMarkdownAction('strike', at('gone tomorrow', 0, 4))
    expect(on.text).toBe('~~gone~~ tomorrow')
    expect(applyMarkdownAction('strike', at(on.text, on.start, on.end)).text).toBe('gone tomorrow')
  })

  it('turns lines into task items, and back', () => {
    const on = applyMarkdownAction('task', at('ship it\nwrite it up', 0, 19))
    expect(on.text).toBe('- [ ] ship it\n- [ ] write it up')
    expect(applyMarkdownAction('task', at(on.text, on.start, on.end)).text).toBe(
      'ship it\nwrite it up'
    )
  })

  it('steps a list item in and out by one level of two spaces', () => {
    const inOnce = applyMarkdownAction('indent', at('- one\n- two', 0, 11))
    expect(inOnce.text).toBe('  - one\n  - two')
    const back = applyMarkdownAction('outdent', at(inOnce.text, inOnce.start, inOnce.end))
    expect(back.text).toBe('- one\n- two')
  })

  it('leaves a line that is not a list item alone — indenting prose makes a code block', () => {
    expect(applyMarkdownAction('indent', at('just a sentence', 0, 15)).text).toBe('just a sentence')
  })

  it('outdenting a top-level item is a no-op rather than eating the marker', () => {
    expect(applyMarkdownAction('outdent', at('- one', 0, 5)).text).toBe('- one')
  })

  it('drops in a table skeleton with the first heading selected', () => {
    const out = applyMarkdownAction('table', at('', 0))
    expect(out.text).toBe('| Column | Column |\n| --- | --- |\n|  |  |\n')
    expect(out.text.slice(out.start, out.end)).toBe('Column')
  })

  it('starts the table on its own line when the caret is mid-line', () => {
    const out = applyMarkdownAction('table', at('notes', 5))
    expect(out.text.startsWith('notes\n| Column')).toBe(true)
    expect(out.text.slice(out.start, out.end)).toBe('Column')
  })
})
