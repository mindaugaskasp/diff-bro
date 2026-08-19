import { describe, expect, it } from 'vitest'
import { serializeMarkdown } from '../../../src/renderer/src/utils/markdownSerialize'
import { parseMarkdown } from '../../../src/renderer/src/utils/markdownRender'

const text = (value) => ({ type: 'text', value })

describe('serializeMarkdown', () => {
  it('returns an empty string for an empty tree', () => {
    expect(serializeMarkdown([])).toBe('')
    expect(serializeMarkdown(null)).toBe('')
  })

  it('writes headings at their level', () => {
    const blocks = [
      { type: 'heading', level: 1, inlines: [text('One')] },
      { type: 'heading', level: 6, inlines: [text('Six')] }
    ]
    expect(serializeMarkdown(blocks)).toBe('# One\n\n###### Six')
  })

  it('joins a paragraph on its own lines', () => {
    const blocks = [{ type: 'paragraph', lines: [[text('first')], [text('second')]] }]
    expect(serializeMarkdown(blocks)).toBe('first\nsecond')
  })

  it('writes every inline marker', () => {
    const blocks = [
      {
        type: 'paragraph',
        lines: [
          [
            { type: 'strong', inlines: [text('b')] },
            text(' '),
            { type: 'em', inlines: [text('i')] },
            text(' '),
            { type: 'del', inlines: [text('s')] },
            text(' '),
            { type: 'code', value: 'c' },
            text(' '),
            { type: 'link', label: 'l', href: 'u' }
          ]
        ]
      }
    ]
    expect(serializeMarkdown(blocks)).toBe('**b** *i* ~~s~~ `c` [l](u)')
  })

  // <u> would be markup parseMarkdown cannot read back.
  it('degrades ins to plain text', () => {
    const blocks = [{ type: 'paragraph', lines: [[{ type: 'ins', inlines: [text('under')] }]] }]
    expect(serializeMarkdown(blocks)).toBe('under')
  })

  it('indents nested list items two spaces per depth', () => {
    const blocks = [
      {
        type: 'list',
        ordered: false,
        items: [
          { depth: 1, inlines: [text('top')] },
          { depth: 2, inlines: [text('nested')] },
          { depth: 3, inlines: [text('deeper')] }
        ]
      }
    ]
    expect(serializeMarkdown(blocks)).toBe('- top\n  - nested\n    - deeper')
  })

  it('numbers ordered items', () => {
    const blocks = [
      {
        type: 'list',
        ordered: true,
        items: [
          { depth: 1, inlines: [text('a')] },
          { depth: 1, inlines: [text('b')] }
        ]
      }
    ]
    expect(serializeMarkdown(blocks)).toBe('1. a\n2. b')
  })

  it('writes task state', () => {
    const blocks = [
      {
        type: 'list',
        ordered: false,
        items: [
          { depth: 1, task: true, checked: false, inlines: [text('todo')] },
          { depth: 1, task: true, checked: true, inlines: [text('done')] }
        ]
      }
    ]
    expect(serializeMarkdown(blocks)).toBe('- [ ] todo\n- [x] done')
  })

  it('prefixes every line of a quote, including nested blocks', () => {
    const blocks = [
      {
        type: 'quote',
        children: [
          { type: 'heading', level: 2, inlines: [text('Title')] },
          { type: 'paragraph', lines: [[text('body')]] }
        ]
      }
    ]
    expect(serializeMarkdown(blocks)).toBe('> ## Title\n>\n> body')
  })

  it('fences a code block', () => {
    const blocks = [{ type: 'code', code: 'const a = 1\nconst b = 2' }]
    expect(serializeMarkdown(blocks)).toBe('```\nconst a = 1\nconst b = 2\n```')
  })

  it('writes a table with its alignment row', () => {
    const blocks = [
      {
        type: 'table',
        align: ['left', 'center', 'right'],
        head: [[text('a')], [text('b')], [text('c')]],
        rows: [[[text('1')], [text('2')], [text('3')]]]
      }
    ]
    expect(serializeMarkdown(blocks)).toBe('| a | b | c |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |')
  })

  it('writes a default separator when no alignment is recorded', () => {
    const blocks = [{ type: 'table', align: [], head: [[text('a')], [text('b')]], rows: [] }]
    expect(serializeMarkdown(blocks)).toBe('| a | b |\n| --- | --- |')
  })

  it('separates blocks with a blank line', () => {
    const blocks = [
      { type: 'heading', level: 1, inlines: [text('T')] },
      { type: 'paragraph', lines: [[text('p')]] },
      { type: 'code', code: 'x' }
    ]
    expect(serializeMarkdown(blocks)).toBe('# T\n\np\n\n```\nx\n```')
  })

  // The pair must survive its own output, or the loop drifts on every keystroke.
  it('is stable when re-parsed and re-serialized', () => {
    const src = [
      '# Title',
      '',
      'Some **bold** and a [link](https://x.test).',
      '',
      '- one',
      '  - nested',
      '',
      '1. first',
      '2. second',
      '',
      '- [x] done',
      '- [ ] todo',
      '',
      '> quoted',
      '',
      '```',
      'code()',
      '```',
      '',
      '| a | b |',
      '| --- | --- |',
      '| 1 | 2 |'
    ].join('\n')
    const once = serializeMarkdown(parseMarkdown(src))
    expect(serializeMarkdown(parseMarkdown(once))).toBe(once)
  })
})

describe('serializeMarkdown — malformed trees', () => {
  it('survives blocks missing their fields', () => {
    expect(
      serializeMarkdown([
        { type: 'heading' },
        { type: 'paragraph' },
        { type: 'list' },
        { type: 'code' },
        { type: 'quote' }
      ])
    ).toBe('# \n\n\n\n\n\n```\n\n```\n\n>')
  })

  it('survives a block with no type at all', () => {
    expect(serializeMarkdown([null])).toBe('')
  })

  it('treats an unknown block as a paragraph', () => {
    expect(serializeMarkdown([{ type: 'mystery' }])).toBe('')
  })

  it('clamps a heading level into range', () => {
    expect(serializeMarkdown([{ type: 'heading', level: 99, inlines: [] }])).toBe('###### ')
    expect(serializeMarkdown([{ type: 'heading', level: 0, inlines: [] }])).toBe('# ')
  })

  it('survives inline nodes missing their fields', () => {
    expect(
      serializeMarkdown([
        {
          type: 'paragraph',
          lines: [[{ type: 'code' }, { type: 'link' }, { type: 'text' }, { type: 'mystery' }]]
        }
      ])
    ).toBe('``[]()')
  })

  it('defaults a list item with no depth to the first level', () => {
    expect(
      serializeMarkdown([{ type: 'list', items: [{ inlines: [{ type: 'text', value: 'x' }] }] }])
    ).toBe('- x')
  })

  it('sizes a table from its first row when there is no head', () => {
    expect(
      serializeMarkdown([
        { type: 'table', rows: [[[{ type: 'text', value: '1' }], [{ type: 'text', value: '2' }]]] }
      ])
    ).toBe('| --- | --- |\n| 1 | 2 |')
  })
})
