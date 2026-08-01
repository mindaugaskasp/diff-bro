import { describe, it, expect } from 'vitest'
import {
  MARKDOWN_ACTIONS,
  applyMarkdownAction
} from '../../../src/renderer/src/utils/markdownMarkup'

// Selection [start,end) over `text`.
const model = (text, start, end = start) => ({ text, start, end })
const apply = (id, m) => applyMarkdownAction(id, m)

describe('MARKDOWN_ACTIONS', () => {
  it('every action has an id + title and an icon or a text label', () => {
    for (const a of MARKDOWN_ACTIONS) {
      expect(typeof a.id).toBe('string')
      expect(typeof a.title).toBe('string')
      expect(!!a.icon || !!a.text).toBe(true)
    }
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
