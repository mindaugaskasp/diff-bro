// Pure Markdown transforms behind the snippet editor toolbar. Marker-agnostic
// selection editing lives in markupEdit.js (shared with the Jira toolbar); this
// file is only Markdown's markers + dispatch. Only offers what markdownRender.js
// renders, so the toolbar and the live preview never disagree.
import {
  blockWrap,
  insertBlock,
  linePrefix,
  listBlock,
  mapBlock,
  selected,
  splice,
  wrap
} from './markupEdit'

// Toolbar buttons in display order.
export const MARKDOWN_ACTIONS = [
  { id: 'bold', labelKey: 'markup.bold', syntax: '**text**', icon: 'bold' },
  { id: 'italic', labelKey: 'markup.italic', syntax: '*text*', icon: 'italic' },
  { id: 'strike', labelKey: 'markup.strikethrough', syntax: '~~text~~', icon: 'strikethrough' },
  { id: 'code', labelKey: 'markup.inlineCode', syntax: '`text`', icon: 'code' },
  { id: 'h1', labelKey: 'markup.heading1', syntax: '#', text: 'H1' },
  { id: 'h2', labelKey: 'markup.heading2', syntax: '##', text: 'H2' },
  { id: 'h3', labelKey: 'markup.heading3', syntax: '###', text: 'H3' },
  { id: 'bullet', labelKey: 'markup.bulletList', syntax: '- item', icon: 'list' },
  { id: 'numbered', labelKey: 'markup.numberedList', syntax: '1. item', icon: 'list-ordered' },
  { id: 'task', labelKey: 'markup.taskList', syntax: '- [ ] item', icon: 'check-square' },
  { id: 'indent', labelKey: 'markup.indent', syntax: '  - item', icon: 'indent' },
  { id: 'outdent', labelKey: 'markup.outdent', syntax: '- item', icon: 'outdent' },
  { id: 'quote', labelKey: 'markup.quote', syntax: '> text', icon: 'quote' },
  { id: 'table', labelKey: 'markup.table', syntax: '| a | b |', icon: 'table' },
  { id: 'codeblock', labelKey: 'markup.codeBlock', syntax: '```', icon: 'braces' },
  { id: 'link', labelKey: 'markup.link', syntax: '[text](url)', icon: 'link' }
]

const WRAPS = {
  bold: ['**', '**'],
  italic: ['*', '*'],
  strike: ['~~', '~~'],
  code: ['`', '`']
}
// Whole-line leading markers that are mutually exclusive with each other.
const HEADINGS = { h1: '#', h2: '##', h3: '###', quote: '>' }
const HEADING_RE = /^(#{1,6}|>)\s+/
// Per-line list markers (numbered lines all get "1. "; renderers renumber).
const LISTS = { bullet: '-', numbered: '1.', task: '- [ ]' }

// Nesting is leading whitespace here, two spaces to the level (markdownRender's
// depthOf reads it back the same way). Only a LIST line steps — indenting a
// paragraph in Markdown makes it a code block, which is never what the button
// was pressed for.
const LIST_LINE = /^(\s*)([-*+]|\d+[.)])\s/
const LEVEL = '  '
const shift = (m, deeper) =>
  mapBlock(m, (line) => {
    if (!LIST_LINE.test(line)) return line
    if (deeper) return LEVEL + line
    return line.startsWith(LEVEL) ? line.slice(LEVEL.length) : line.replace(/^\s+/, '')
  })

// A 2×2 skeleton with the first heading selected, so it is typed over rather
// than deleted first.
const TABLE = ['| Column | Column |', '| --- | --- |', '|  |  |', ''].join('\n')
const table = (m) => insertBlock(m, TABLE, { at: 2, length: 6 })

// [text](url): a selection becomes the label (caret in the url slot); else a
// placeholder with the word "text" selected.
function link(m) {
  const sel = selected(m)
  if (sel) {
    const text = `[${sel}]()`
    const caret = m.start + text.length - 1
    return splice(m, text, caret, caret)
  }
  return splice(m, '[text](url)', m.start + 1, m.start + 5)
}

// Dispatch to the transform for `id`, returning { text, start, end } or null for
// an unknown id.
export function applyMarkdownAction(id, model) {
  const m = { text: model.text, start: model.start, end: model.end }
  if (WRAPS[id]) return wrap(m, WRAPS[id][0], WRAPS[id][1])
  if (HEADINGS[id]) return linePrefix(m, HEADINGS[id], HEADING_RE)
  if (LISTS[id]) return listBlock(m, LISTS[id])
  if (id === 'codeblock') return blockWrap(m, '```', '```')
  if (id === 'indent' || id === 'outdent') return shift(m, id === 'indent')
  if (id === 'table') return table(m)
  if (id === 'link') return link(m)
  return null
}
