// Pure Markdown transforms behind the snippet editor toolbar. Marker-agnostic
// selection editing lives in markupEdit.js (shared with the Jira toolbar); this
// file is only Markdown's markers + dispatch. Only offers what markdownRender.js
// renders, so the toolbar and the live preview never disagree.
import { blockWrap, linePrefix, listBlock, selected, splice, wrap } from './markupEdit'

// Toolbar buttons in display order.
export const MARKDOWN_ACTIONS = [
  { id: 'bold', title: 'Bold  **text**', icon: 'bold' },
  { id: 'italic', title: 'Italic  *text*', icon: 'italic' },
  { id: 'code', title: 'Inline code  `text`', icon: 'code' },
  { id: 'h1', title: 'Heading 1  #', text: 'H1' },
  { id: 'h2', title: 'Heading 2  ##', text: 'H2' },
  { id: 'h3', title: 'Heading 3  ###', text: 'H3' },
  { id: 'bullet', title: 'Bullet list  - item', icon: 'list' },
  { id: 'numbered', title: 'Numbered list  1. item', icon: 'list-ordered' },
  { id: 'quote', title: 'Quote  > text', icon: 'quote' },
  { id: 'codeblock', title: 'Code block  ```', icon: 'braces' },
  { id: 'link', title: 'Link  [text](url)', icon: 'link' }
]

const WRAPS = {
  bold: ['**', '**'],
  italic: ['*', '*'],
  code: ['`', '`']
}
// Whole-line leading markers that are mutually exclusive with each other.
const HEADINGS = { h1: '#', h2: '##', h3: '###', quote: '>' }
const HEADING_RE = /^(#{1,6}|>)\s+/
// Per-line list markers (numbered lines all get "1. "; renderers renumber).
const LISTS = { bullet: '-', numbered: '1.' }

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
  if (id === 'link') return link(m)
  return null
}
