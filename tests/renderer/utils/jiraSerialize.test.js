import { describe, expect, it } from 'vitest'
import { serializeJira } from '../../../src/renderer/src/utils/jiraSerialize'
import { parseJira } from '../../../src/renderer/src/utils/jiraRender'

const text = (value) => ({ type: 'text', value })

describe('serializeJira', () => {
  it('returns an empty string for an empty tree', () => {
    expect(serializeJira([])).toBe('')
    expect(serializeJira(null)).toBe('')
  })

  it('writes headings as hN.', () => {
    const blocks = [
      { type: 'heading', level: 1, inlines: [text('One')] },
      { type: 'heading', level: 3, inlines: [text('Three')] }
    ]
    expect(serializeJira(blocks)).toBe('h1. One\n\nh3. Three')
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
            { type: 'ins', inlines: [text('u')] },
            text(' '),
            { type: 'del', inlines: [text('s')] },
            text(' '),
            { type: 'code', value: 'c' }
          ]
        ]
      }
    ]
    expect(serializeJira(blocks)).toBe('*b* _i_ +u+ -s- {{c}}')
  })

  it('writes a link, collapsing the pipe when label and href match', () => {
    const blocks = [
      {
        type: 'paragraph',
        lines: [
          [{ type: 'link', label: 'Docs', href: 'https://x.test' }],
          [{ type: 'link', label: 'https://x.test', href: 'https://x.test' }]
        ]
      }
    ]
    expect(serializeJira(blocks)).toBe('[Docs|https://x.test]\n[https://x.test]')
  })

  // jiraRender reads depth off the marker's length, not indentation.
  it('repeats the marker for depth', () => {
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
    expect(serializeJira(blocks)).toBe('* top\n** nested\n*** deeper')
  })

  it('uses # for an ordered list', () => {
    const blocks = [
      {
        type: 'list',
        ordered: true,
        items: [
          { depth: 1, inlines: [text('a')] },
          { depth: 2, inlines: [text('b')] }
        ]
      }
    ]
    expect(serializeJira(blocks)).toBe('# a\n## b')
  })

  // Jira has no task syntax; parseJira would render the brackets literally.
  it('drops a task box', () => {
    const blocks = [
      {
        type: 'list',
        ordered: false,
        items: [{ depth: 1, task: true, checked: true, inlines: [text('done')] }]
      }
    ]
    expect(serializeJira(blocks)).toBe('* done')
  })

  it('fences a quote, because the tree can hold more than one line', () => {
    const blocks = [
      {
        type: 'quote',
        children: [
          { type: 'heading', level: 2, inlines: [text('Title')] },
          { type: 'paragraph', lines: [[text('body')]] }
        ]
      }
    ]
    expect(serializeJira(blocks)).toBe('{quote}\nh2. Title\n\nbody\n{quote}')
  })

  it('fences a code block', () => {
    const blocks = [{ type: 'code', code: 'const a = 1\nconst b = 2' }]
    expect(serializeJira(blocks)).toBe('{code}\nconst a = 1\nconst b = 2\n{code}')
  })

  it('writes a table with a || header and no alignment row', () => {
    const blocks = [
      {
        type: 'table',
        align: [],
        head: [[text('a')], [text('b')]],
        rows: [[[text('1')], [text('2')]]]
      }
    ]
    expect(serializeJira(blocks)).toBe('|| a || b ||\n| 1 | 2 |')
  })

  it('writes a headerless table, which Jira renders too', () => {
    const blocks = [{ type: 'table', align: [], head: [], rows: [[[text('1')], [text('2')]]] }]
    expect(serializeJira(blocks)).toBe('| 1 | 2 |')
  })

  it('separates blocks with a blank line', () => {
    const blocks = [
      { type: 'heading', level: 1, inlines: [text('T')] },
      { type: 'paragraph', lines: [[text('p')]] }
    ]
    expect(serializeJira(blocks)).toBe('h1. T\n\np')
  })

  it('is stable when re-parsed and re-serialized', () => {
    const src = [
      'h1. Title',
      '',
      'Some *bold* and a [link|https://x.test].',
      '',
      '* one',
      '** nested',
      '',
      '# first',
      '# second',
      '',
      '{quote}',
      'quoted',
      '{quote}',
      '',
      '{code}',
      'code()',
      '{code}',
      '',
      '|| a || b ||',
      '| 1 | 2 |'
    ].join('\n')
    const once = serializeJira(parseJira(src))
    expect(serializeJira(parseJira(once))).toBe(once)
  })
})

// domToBlocks reads a DOM mid-edit, so a half-formed block is a real input.
describe('serializeJira — malformed trees', () => {
  it('survives blocks missing their fields', () => {
    expect(
      serializeJira([
        { type: 'heading' },
        { type: 'paragraph' },
        { type: 'list' },
        { type: 'table' },
        { type: 'code' },
        { type: 'quote' }
      ])
    ).toBe('h1. \n\n\n\n\n\n\n\n{code}\n\n{code}\n\n{quote}\n\n{quote}')
  })

  it('treats an unknown block as a paragraph', () => {
    expect(serializeJira([{ type: 'mystery' }])).toBe('')
  })

  it('survives a block with no type at all', () => {
    expect(serializeJira([null])).toBe('')
  })

  it('clamps a heading level into range', () => {
    expect(serializeJira([{ type: 'heading', level: 99, inlines: [] }])).toBe('h6. ')
    expect(serializeJira([{ type: 'heading', level: 0, inlines: [] }])).toBe('h1. ')
  })

  it('survives inline nodes missing their fields', () => {
    expect(
      serializeJira([
        {
          type: 'paragraph',
          lines: [[{ type: 'code' }, { type: 'link' }, { type: 'text' }, { type: 'mystery' }]]
        }
      ])
    ).toBe('{{}}[]')
  })

  it('defaults a list item with no depth to the first level', () => {
    expect(
      serializeJira([{ type: 'list', items: [{ inlines: [{ type: 'text', value: 'x' }] }] }])
    ).toBe('* x')
  })
})
