import { describe, it, expect } from 'vitest'
import { parseMarkdown, parseInline } from '../../../src/renderer/src/utils/markdownRender'

const types = (nodes) => nodes.map((n) => n.type)

describe('parseInline', () => {
  it('parses strong, em, inline code, and links', () => {
    const nodes = parseInline('a **b** _c_ `d` [e](http://x)')
    expect(types(nodes)).toEqual(['text', 'strong', 'text', 'em', 'text', 'code', 'text', 'link'])
    expect(nodes[1].inlines[0].value).toBe('b')
    expect(nodes[5].value).toBe('d')
    expect(nodes[7]).toMatchObject({ type: 'link', label: 'e', href: 'http://x' })
  })

  it('prefers ** over * so bold is not mistaken for italic', () => {
    expect(parseInline('**x**')[0].type).toBe('strong')
    expect(parseInline('*x*')[0].type).toBe('em')
  })

  it('leaves inline code contents unparsed', () => {
    const nodes = parseInline('`**not bold**`')
    expect(nodes).toEqual([{ type: 'code', value: '**not bold**' }])
  })
})

describe('parseMarkdown', () => {
  it('parses ATX headings by hash count', () => {
    expect(parseMarkdown('### Hi')[0]).toMatchObject({ type: 'heading', level: 3 })
  })

  it('parses bulleted and numbered lists with indent depth', () => {
    const ul = parseMarkdown('- a\n  - b')[0]
    expect(ul).toMatchObject({ type: 'list', ordered: false })
    expect(ul.items.map((i) => i.depth)).toEqual([1, 2])

    const ol = parseMarkdown('1. one\n2. two')[0]
    expect(ol).toMatchObject({ type: 'list', ordered: true })
    expect(ol.items).toHaveLength(2)
  })

  it('parses blockquotes as nested blocks', () => {
    const q = parseMarkdown('> quoted line')[0]
    expect(q.type).toBe('quote')
    expect(q.children[0].type).toBe('paragraph')
  })

  it('parses fenced code verbatim, ignoring markup inside', () => {
    expect(parseMarkdown('```js\nconst x = **1**\n```')[0]).toEqual({
      type: 'code',
      code: 'const x = **1**'
    })
  })

  it('groups consecutive plain lines into one paragraph', () => {
    const blocks = parseMarkdown('line one\nline two\n\n# heading')
    expect(types(blocks)).toEqual(['paragraph', 'heading'])
    expect(blocks[0].lines).toHaveLength(2)
  })

  it('tolerates empty / nullish input', () => {
    expect(parseMarkdown('')).toEqual([])
    expect(parseMarkdown(null)).toEqual([])
  })
})
