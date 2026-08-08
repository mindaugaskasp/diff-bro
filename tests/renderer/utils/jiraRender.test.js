import { describe, expect, it } from 'vitest'
import { parseInline, parseJira } from '../../../src/renderer/src/utils/jiraRender'

// Compact view of an inline run: type plus text/label for readability.
const flat = (nodes) =>
  nodes.map((n) =>
    n.type === 'text' ? n.value : n.type === 'link' ? `link:${n.label}|${n.href}` : n.type
  )

describe('parseInline', () => {
  it('leaves plain text as a single text node', () => {
    expect(parseInline('just words')).toEqual([{ type: 'text', value: 'just words' }])
  })

  it('parses the emphasis markers', () => {
    expect(flat(parseInline('a *b* _c_ +d+ -e- end'))).toEqual([
      'a ',
      'strong',
      ' ',
      'em',
      ' ',
      'ins',
      ' ',
      'del',
      ' end'
    ])
  })

  it('keeps a hyphen inside a word as literal text (word-boundary rule)', () => {
    expect(parseInline('well-formed name')).toEqual([{ type: 'text', value: 'well-formed name' }])
  })

  it('nests emphasis', () => {
    const [node] = parseInline('*_bold italic_*')
    expect(node.type).toBe('strong')
    expect(node.inlines[0].type).toBe('em')
  })

  it('parses monospace and both link forms', () => {
    expect(parseInline('{{code}}')).toEqual([{ type: 'code', value: 'code' }])
    expect(flat(parseInline('[Docs|http://x] and [http://y]'))).toEqual([
      'link:Docs|http://x',
      ' and ',
      'link:http://y|http://y'
    ])
  })
})

describe('parseJira — blocks', () => {
  it('parses a heading with inline emphasis', () => {
    const [h] = parseJira('h2. A *bold* title')
    expect(h.type).toBe('heading')
    expect(h.level).toBe(2)
    expect(flat(h.inlines)).toEqual(['A ', 'strong', ' title'])
  })

  it('groups a bullet list and marks depth', () => {
    const [list] = parseJira('* one\n* two\n** nested')
    expect(list).toMatchObject({ type: 'list', ordered: false })
    expect(list.items.map((i) => i.depth)).toEqual([1, 1, 2])
  })

  it('splits a numbered list from an adjacent bullet list', () => {
    const blocks = parseJira('# first\n* second')
    expect(blocks[0]).toMatchObject({ type: 'list', ordered: true })
    expect(blocks[1]).toMatchObject({ type: 'list', ordered: false })
  })

  it('parses a {code} block verbatim, ignoring markup inside', () => {
    const [code] = parseJira('{code}\nlet x = *not bold*\n{code}')
    expect(code).toEqual({ type: 'code', code: 'let x = *not bold*' })
  })

  it('parses a bq. quote into child blocks', () => {
    const [q] = parseJira('bq. quoted *text*')
    expect(q.type).toBe('quote')
    expect(q.children[0].type).toBe('paragraph')
  })

  it('parses a {quote} block with nested structure', () => {
    const [q] = parseJira('{quote}\nh3. Inside\n{quote}')
    expect(q.type).toBe('quote')
    expect(q.children[0]).toMatchObject({ type: 'heading', level: 3 })
  })

  it('collects consecutive plain lines into one paragraph, blank lines split them', () => {
    const blocks = parseJira('line one\nline two\n\nsecond para')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].type).toBe('paragraph')
    expect(blocks[0].lines).toHaveLength(2)
    expect(blocks[1].lines).toHaveLength(1)
  })

  it('returns no blocks for empty input', () => {
    expect(parseJira('')).toEqual([])
    expect(parseJira('   \n  ')).toEqual([])
  })
})

// Jira accepts a code block opened and closed on ONE line, which is how a
// single command is usually pasted. The fence patterns are anchored, so it fell
// through to a paragraph and rendered as literal braces.
describe('a code block that opens and closes on one line', () => {
  it('is a code block, braces and all removed', () => {
    const [block] = parseJira('{code:bash}brew upgrade --cask diff-bro{code}')
    expect(block).toEqual({ type: 'code', code: 'brew upgrade --cask diff-bro' })
  })

  it('works without a language too', () => {
    expect(parseJira('{code}npm run check{code}')[0]).toEqual({
      type: 'code',
      code: 'npm run check'
    })
  })

  it('keeps braces inside the body', () => {
    expect(parseJira('{code:js}const a = { b: 1 }{code}')[0].code).toBe('const a = { b: 1 }')
  })

  it('leaves the multi-line form exactly as it was', () => {
    const blocks = parseJira('{code:bash}\nline one\nline two\n{code}')
    expect(blocks).toEqual([{ type: 'code', code: 'line one\nline two' }])
  })

  // An opener with no closer on the line is still the start of a fence.
  it('does not mistake an ordinary opener for the one-line form', () => {
    expect(parseJira('{code:bash}\nonly{code}')[0]).toEqual({ type: 'code', code: 'only' })
  })

  it('takes an empty one-line block as an empty block', () => {
    expect(parseJira('{code}{code}')[0]).toEqual({ type: 'code', code: '' })
  })
})
