// Pure Jira/Confluence wiki-markup transforms behind the snippet editor toolbar.
// The marker-agnostic selection editing lives in markupEdit.js (shared with the
// Markdown toolbar); this file is only Jira's markers + dispatch.
import { blockWrap, linePrefix, listBlock, selected, splice, wrap } from './markupEdit'

// Toolbar buttons in display order.
export const JIRA_ACTIONS = [
  { id: 'bold', title: 'Bold  *text*', icon: 'bold' },
  { id: 'italic', title: 'Italic  _text_', icon: 'italic' },
  { id: 'underline', title: 'Underline  +text+', icon: 'underline' },
  { id: 'strike', title: 'Strikethrough  -text-', icon: 'strikethrough' },
  { id: 'code', title: 'Inline monospace  {{text}}', icon: 'code' },
  { id: 'h1', title: 'Heading 1  h1.', text: 'H1' },
  { id: 'h2', title: 'Heading 2  h2.', text: 'H2' },
  { id: 'h3', title: 'Heading 3  h3.', text: 'H3' },
  { id: 'bullet', title: 'Bullet list  * item', icon: 'list' },
  { id: 'numbered', title: 'Numbered list  # item', icon: 'list-ordered' },
  { id: 'quote', title: 'Quote  bq.', icon: 'quote' },
  { id: 'codeblock', title: 'Code block  {code}', icon: 'braces' },
  { id: 'link', title: 'Link  [text|url]', icon: 'link' }
]

const WRAPS = {
  bold: ['*', '*'],
  italic: ['_', '_'],
  underline: ['+', '+'],
  strike: ['-', '-'],
  code: ['{{', '}}']
}
// Whole-line leading markers that are mutually exclusive with each other.
const HEADINGS = { h1: 'h1.', h2: 'h2.', h3: 'h3.', quote: 'bq.' }
const HEADING_RE = /^(h[1-6]\.|bq\.)\s+/
// Per-line list markers.
const LISTS = { bullet: '*', numbered: '#' }

// [text|url]: a selection becomes the label (caret in the url slot); else a
// placeholder.
function link(m) {
  const sel = selected(m)
  if (sel) {
    const text = `[${sel}|]`
    const caret = m.start + text.length - 1
    return splice(m, text, caret, caret)
  }
  return splice(m, '[text|url]', m.start + 1, m.start + 5)
}

// Dispatch to the transform for `id`, returning { text, start, end } or null for
// an unknown id.
export function applyJiraAction(id, model) {
  const m = { text: model.text, start: model.start, end: model.end }
  if (WRAPS[id]) return wrap(m, WRAPS[id][0], WRAPS[id][1])
  if (HEADINGS[id]) return linePrefix(m, HEADINGS[id], HEADING_RE)
  if (LISTS[id]) return listBlock(m, LISTS[id])
  if (id === 'codeblock') return blockWrap(m, '{code}', '{code}')
  if (id === 'link') return link(m)
  return null
}
