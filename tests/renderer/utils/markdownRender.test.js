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

// What the toolbar gained, from the other side: the preview has to draw each one
// or the button writes syntax that renders as literal text.
describe('parseMarkdown — strikethrough, tasks and tables', () => {
  it('reads ~~text~~ as the same del node Jira emits for -text-', () => {
    const [p] = parseMarkdown('a ~~gone~~ b')
    expect(p.lines[0][1]).toEqual({ type: 'del', inlines: [{ type: 'text', value: 'gone' }] })
  })

  it('carries a task item and its state, ticked or not', () => {
    const [list] = parseMarkdown('- [x] done\n- [ ] todo')
    expect(list.items.map((i) => [i.task, i.checked])).toEqual([
      [true, true],
      [true, false]
    ])
    expect(list.items[0].inlines).toEqual([{ type: 'text', value: 'done' }])
  })

  it('takes an upper-case X, and leaves an ordinary bullet untouched', () => {
    expect(parseMarkdown('- [X] done')[0].items[0].checked).toBe(true)
    expect('task' in parseMarkdown('- plain')[0].items[0]).toBe(false)
  })

  it('reads a table with its header, rows and per-column alignment', () => {
    const [t] = parseMarkdown('| A | B | C |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |')
    expect(t.type).toBe('table')
    expect(t.align).toEqual(['left', 'center', 'right'])
    expect(t.head.map((c) => c[0].value)).toEqual(['A', 'B', 'C'])
    expect(t.rows).toHaveLength(2)
    expect(t.rows[1].map((c) => c[0].value)).toEqual(['4', '5', '6'])
  })

  it('renders inline markup inside a cell', () => {
    const [t] = parseMarkdown('| A |\n| --- |\n| **bold** |')
    expect(t.rows[0][0][0]).toEqual({
      type: 'strong',
      inlines: [{ type: 'text', value: 'bold' }]
    })
  })

  // The separator row is what makes it a table — prose about a shell pipeline
  // has pipes in it and is not one.
  it('leaves a pipe-bearing paragraph as a paragraph', () => {
    expect(parseMarkdown('use | to pipe')[0].type).toBe('paragraph')
    expect(parseMarkdown('| a | b |\nno separator')[0].type).toBe('paragraph')
  })

  it('ends the table at the first line that is not a row', () => {
    const blocks = parseMarkdown('| A |\n| --- |\n| 1 |\nafter')
    expect(blocks[0].rows).toHaveLength(1)
    expect(blocks[1].type).toBe('paragraph')
  })
})
