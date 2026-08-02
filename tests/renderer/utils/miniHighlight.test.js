import { describe, expect, it } from 'vitest'
import { miniLines, miniSpans } from '../../../src/renderer/src/utils/miniHighlight'

const rolesOf = (spans) => spans.filter((s) => s.role).map((s) => [s.role, s.text])
const joined = (spans) => spans.map((s) => s.text).join('')

describe('miniSpans — covers the line whole', () => {
  // The preview shows the snippet; colour must never cost a character of it.
  it('gives the line back exactly, whatever it colours', () => {
    for (const [line, lang] of [
      ['const x = "hi" // note', 'javascript'],
      ['  name: diff-engine   # trailing', 'yaml'],
      ['SELECT * FROM t -- all', 'sql'],
      ['', 'python'],
      ['   ', 'yaml'],
      ['"unterminated', 'json'],
      ['a\tb  c', 'plaintext']
    ]) {
      expect(joined(miniSpans(line, lang))).toBe(line)
    }
  })
})

describe('miniSpans — what it colours', () => {
  it('colours a YAML key, its comment and a number', () => {
    expect(rolesOf(miniSpans('replicas: 3 # scale', 'yaml'))).toEqual([
      ['property', 'replicas'],
      ['number', '3'],
      ['comment', '# scale']
    ])
  })

  it('colours a JSON key apart from its string value', () => {
    expect(rolesOf(miniSpans('  "name": "bro",', 'json'))).toEqual([
      ['property', '"name"'],
      ['string', '"bro"']
    ])
  })

  it('colours JavaScript keywords, strings and line comments', () => {
    expect(rolesOf(miniSpans('const a = "x" // why', 'javascript'))).toEqual([
      ['keyword', 'const'],
      ['string', '"x"'],
      ['comment', '// why']
    ])
  })

  it('uses -- for SQL comments, not //', () => {
    expect(rolesOf(miniSpans('SELECT 1 -- one', 'sql'))).toEqual([
      ['keyword', 'SELECT'],
      ['number', '1'],
      ['comment', '-- one']
    ])
  })

  it('uses # for shell and python', () => {
    // `cd` is a shell BUILTIN, not a keyword — the grammar makes that
    // distinction, which is the reason for using one.
    expect(rolesOf(miniSpans('cd /tmp # go', 'shell'))).toEqual([
      ['property', 'cd'],
      ['comment', '# go']
    ])
    expect(rolesOf(miniSpans('if true; then # here', 'shell'))[0]).toEqual(['keyword', 'if'])
    expect(rolesOf(miniSpans('def f(): # here', 'python'))[0]).toEqual(['keyword', 'def'])
  })

  it('does not treat a # inside a string as a comment', () => {
    expect(rolesOf(miniSpans('name: "a # b"', 'yaml'))).toEqual([
      ['property', 'name'],
      ['string', '"a # b"']
    ])
  })

  it('does not colour a keyword that is only part of a longer word', () => {
    expect(rolesOf(miniSpans('constant = 1', 'javascript'))).toEqual([['number', '1']])
  })

  it('handles an escaped quote inside a string', () => {
    expect(rolesOf(miniSpans('a = "say \\"hi\\"" ', 'javascript'))).toEqual([
      ['string', '"say \\"hi\\""']
    ])
  })

  it('leaves plain text and unknown languages uncoloured', () => {
    expect(rolesOf(miniSpans('const not really code', 'plaintext'))).toEqual([])
    expect(rolesOf(miniSpans('const x = 1', ''))).toEqual([])
    expect(rolesOf(miniSpans('const x = 1', 'klingon'))).toEqual([])
  })

  it('knows Dockerfile instructions', () => {
    expect(rolesOf(miniSpans('FROM node:22', 'dockerfile'))[0]).toEqual(['keyword', 'FROM'])
  })
})

describe('miniLines', () => {
  it('splits a snippet into per-line spans', () => {
    const lines = miniLines('# a note\nreplicas: 3', 'yaml')
    expect(lines).toHaveLength(2)
    expect(rolesOf(lines[0])).toEqual([['comment', '# a note']])
    expect(rolesOf(lines[1])).toEqual([
      ['property', 'replicas'],
      ['number', '3']
    ])
  })

  // Each line stands alone, so an unclosed string cannot bleed into the rest.
  it('does not carry a string across lines', () => {
    const lines = miniLines('a = "open\nb = 2', 'javascript')
    expect(rolesOf(lines[1])).toEqual([['number', '2']])
  })
})

// The grammar earns its keep on the cases hand-rolled regexes miss.
describe('miniSpans — the long tail a grammar handles', () => {
  it('does not end a template literal at an apostrophe', () => {
    const line = "const s = `it's ${x} here`"
    expect(joined(miniSpans(line, 'javascript'))).toBe(line)
    expect(rolesOf(miniSpans(line, 'javascript'))[0]).toEqual(['keyword', 'const'])
  })

  it('treats a regex literal as a literal, not division', () => {
    const spans = miniSpans('const re = /ab+c/gi', 'javascript')
    expect(joined(spans)).toBe('const re = /ab+c/gi')
    expect(spans.some((s) => s.role === 'string')).toBe(true)
  })

  it('colours a markup attribute value apart from the tag it sits in', () => {
    const line = '<a href="x">hi</a>'
    const spans = miniSpans(line, 'html')
    expect(joined(spans)).toBe(line)
    // Tag and attribute name share the property role and coalesce; the value
    // is the part that has to read differently.
    expect(spans.some((s) => s.role === 'string' && s.text.includes('"x"'))).toBe(true)
  })

  it('handles a CSS rule', () => {
    const roles = rolesOf(miniSpans('  color: var(--text);', 'css'))
    expect(roles.some(([role]) => role === 'property')).toBe(true)
  })
})
