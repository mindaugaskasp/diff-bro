// Monaco hands back per-line tokens as {offset, type}; this turns them into the
// spans the preview renders through interpolation. Pure, so it tests without
// Monaco — which cannot be imported here anyway.
import { describe, expect, it } from 'vitest'
import { SYNTAX_ROLES, roleOf, spansFor } from '../../../src/renderer/src/utils/highlight'

const tok = (offset, type) => ({ offset, type })

describe('roleOf', () => {
  // The vocabulary was read off a real Monaco in the app, not guessed: every
  // type below is one it actually emitted for a snippet language.
  it('maps the roots Monaco emits onto the five roles', () => {
    expect(roleOf('keyword.json')).toBe('keyword')
    expect(roleOf('keyword.class.java')).toBe('keyword')
    expect(roleOf('string.value.json')).toBe('string')
    expect(roleOf('string.escape.python')).toBe('string')
    expect(roleOf('number.js')).toBe('number')
    expect(roleOf('constant.mermaid')).toBe('number')
    expect(roleOf('comment.sql')).toBe('comment')
    expect(roleOf('comment.content.xml')).toBe('comment')
  })

  // A JSON key and a JSON value are both strings to Monaco's namespace but not
  // to a reader, so the key takes the property role.
  it('separates a JSON key from a JSON value', () => {
    expect(roleOf('string.key.json')).toBe('property')
    expect(roleOf('string.value.json')).toBe('string')
  })

  it('treats tags, types and attribute names as the property role', () => {
    expect(roleOf('tag.xml')).toBe('property')
    expect(roleOf('type.yaml')).toBe('property')
    expect(roleOf('attribute.name.css')).toBe('property')
  })

  it('gives an attribute VALUE the string role, not property', () => {
    expect(roleOf('attribute.value.xml')).toBe('string')
    expect(roleOf('attribute.value.hex.css')).toBe('string')
  })

  it('leaves plain runs unroled rather than inventing a colour', () => {
    for (const type of ['', 'identifier.js', 'white.python', 'delimiter.bracket.js', 'source']) {
      expect(roleOf(type)).toBe('')
    }
  })

  it('never returns a role outside the palette', () => {
    const seen = ['keyword.x', 'string.x', 'number.x', 'tag.x', 'comment.x', 'nonsense', '']
    for (const t of seen) {
      const r = roleOf(t)
      expect(r === '' || SYNTAX_ROLES.includes(r)).toBe(true)
    }
  })
})

describe('spansFor', () => {
  it('slices a line at the token offsets', () => {
    const spans = spansFor('const a = 1', [tok(0, 'keyword.js'), tok(5, ''), tok(10, 'number.js')])
    expect(spans).toEqual([
      { text: 'const', role: 'keyword' },
      { text: ' a = ', role: '' },
      { text: '1', role: 'number' }
    ])
  })

  it('reassembles the line exactly, character for character', () => {
    const line = '  "n": 42,  '
    const spans = spansFor(line, [
      tok(0, ''),
      tok(2, 'string.key.json'),
      tok(5, ''),
      tok(7, 'number.json')
    ])
    expect(spans.map((s) => s.text).join('')).toBe(line)
  })

  it('renders a line with no tokens as one plain span', () => {
    expect(spansFor('just words', [])).toEqual([{ text: 'just words', role: '' }])
    expect(spansFor('just words', null)).toEqual([{ text: 'just words', role: '' }])
  })

  it('keeps an empty line renderable rather than dropping it', () => {
    expect(spansFor('', [])).toEqual([{ text: '', role: '' }])
  })

  // Monaco reports offsets into the line it tokenized; a stale or mismatched
  // token list must not throw or silently eat characters.
  it('survives offsets past the end of the line', () => {
    const spans = spansFor('ab', [tok(0, 'keyword.js'), tok(99, 'number.js')])
    expect(spans.map((s) => s.text).join('')).toBe('ab')
  })

  it('drops a zero-width run rather than emitting an empty span', () => {
    const spans = spansFor('ab', [tok(0, 'keyword.js'), tok(0, 'number.js'), tok(1, '')])
    expect(spans.every((s) => s.text.length > 0)).toBe(true)
    expect(spans.map((s) => s.text).join('')).toBe('ab')
  })
})
