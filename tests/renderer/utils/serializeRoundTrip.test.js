import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../../../src/renderer/src/utils/markdownRender'
import { parseJira } from '../../../src/renderer/src/utils/jiraRender'
import { serializeMarkdown } from '../../../src/renderer/src/utils/markdownSerialize'
import { serializeJira } from '../../../src/renderer/src/utils/jiraSerialize'

// domToBlocks.test.js owns the DOM leg; this owns the text legs. If the TREE
// survives a trip through text, an edit can lose spelling but never structure.
const DIALECTS = {
  markdown: { parse: parseMarkdown, serialize: serializeMarkdown },
  jira: { parse: parseJira, serialize: serializeJira }
}

const MARKDOWN_FIXTURES = [
  '# Heading',
  'Plain paragraph.',
  'Mixed **bold** and *em* and ~~gone~~ and `code`.',
  'A [link](https://x.test) mid-sentence.',
  '- one\n- two',
  '- top\n  - nested\n    - deeper',
  '1. first\n2. second',
  '- [ ] todo\n- [x] done',
  '> quoted line',
  '```\nfn()\n```',
  '| a | b |\n| --- | --- |\n| 1 | 2 |',
  '| a | b |\n| :--- | ---: |\n| 1 | 2 |',
  '# Title\n\nBody text.\n\n- a\n- b'
]

const JIRA_FIXTURES = [
  'h1. Heading',
  'Plain paragraph.',
  'Mixed *bold* and _em_ and +ins+ and -del- and {{code}}.',
  'A [link|https://x.test] mid-sentence.',
  '* one\n* two',
  '* top\n** nested\n*** deeper',
  '# first\n# second',
  '{quote}\nquoted line\n{quote}',
  '{code}\nfn()\n{code}',
  '|| a || b ||\n| 1 | 2 |',
  '| 1 | 2 |',
  'h1. Title\n\nBody text.\n\n* a\n* b'
]

describe.each([
  ['markdown', MARKDOWN_FIXTURES],
  ['jira', JIRA_FIXTURES]
])('%s round trip', (name, fixtures) => {
  const { parse, serialize } = DIALECTS[name]

  it.each(fixtures)('keeps the tree through text: %j', (src) => {
    expect(parse(serialize(parse(src)))).toEqual(parse(src))
  })

  it.each(fixtures)('is a fixed point after one pass: %j', (src) => {
    const once = serialize(parse(src))
    expect(serialize(parse(once))).toBe(once)
  })
})

// Asserted one by one, so a silent WIDENING of the losses fails the build.
describe('accepted Markdown normalisations', () => {
  const normalised = (src) => serializeMarkdown(parseMarkdown(src))

  it.each([
    ['* item', '- item'],
    ['+ item', '- item'],
    ['_em_', '*em*'],
    ['__strong__', '**strong**'],
    ['1) first', '1. first'],
    ['~~~\ncode\n~~~', '```\ncode\n```']
  ])('%j becomes %j', (src, want) => {
    expect(normalised(src)).toBe(want)
  })

  it('renumbers an ordered list from its position, not its source digits', () => {
    expect(normalised('5. five\n9. nine')).toBe('1. five\n2. nine')
  })

  it('has no spelling for ins, so it degrades to text', () => {
    expect(serializeMarkdown(parseJira('+underlined+'))).toBe('underlined')
  })
})

describe('accepted Jira normalisations', () => {
  const normalised = (src) => serializeJira(parseJira(src))

  it.each([
    ['bq. quoted', '{quote}\nquoted\n{quote}'],
    ['{code:java}\nx\n{code}', '{code}\nx\n{code}'],
    ['[https://x.test|https://x.test]', '[https://x.test]']
  ])('%j becomes %j', (src, want) => {
    expect(normalised(src)).toBe(want)
  })

  it('drops a task box, which Jira has no syntax for', () => {
    expect(serializeJira(parseMarkdown('- [x] done'))).toBe('* done')
  })
})
