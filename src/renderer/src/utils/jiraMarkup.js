// Pure Jira/Confluence wiki-markup transforms behind the snippet editor toolbar.
// The marker-agnostic selection editing lives in markupEdit.js (shared with the
// Markdown toolbar); this file is only Jira's markers + dispatch.
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

// Toolbar buttons in display order. The label is translatable; `syntax` never
// is — it is the language's own grammar, and vue-i18n would read `[text|url]` as
// a two-form PLURAL and `{code}` / `{{text}}` as interpolation.
export const JIRA_ACTIONS = [
  { id: 'bold', labelKey: 'markup.bold', syntax: '*text*', icon: 'bold' },
  { id: 'italic', labelKey: 'markup.italic', syntax: '_text_', icon: 'italic' },
  { id: 'underline', labelKey: 'markup.underline', syntax: '+text+', icon: 'underline' },
  { id: 'strike', labelKey: 'markup.strikethrough', syntax: '-text-', icon: 'strikethrough' },
  { id: 'code', labelKey: 'markup.inlineMonospace', syntax: '{{text}}', icon: 'code' },
  { id: 'h1', labelKey: 'markup.heading1', syntax: 'h1.', text: 'H1' },
  { id: 'h2', labelKey: 'markup.heading2', syntax: 'h2.', text: 'H2' },
  { id: 'h3', labelKey: 'markup.heading3', syntax: 'h3.', text: 'H3' },
  { id: 'bullet', labelKey: 'markup.bulletList', syntax: '* item', icon: 'list' },
  { id: 'numbered', labelKey: 'markup.numberedList', syntax: '# item', icon: 'list-ordered' },
  { id: 'indent', labelKey: 'markup.indent', syntax: '** item', icon: 'indent' },
  { id: 'outdent', labelKey: 'markup.outdent', syntax: '* item', icon: 'outdent' },
  { id: 'quote', labelKey: 'markup.quote', syntax: 'bq.', icon: 'quote' },
  { id: 'table', labelKey: 'markup.table', syntax: '||a||b||', icon: 'table' },
  { id: 'codeblock', labelKey: 'markup.codeBlock', syntax: '{code}', icon: 'braces' },
  { id: 'link', labelKey: 'markup.link', syntax: '[text|url]', icon: 'link' }
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

// Nesting here is the marker REPEATED — `**` is a second-level bullet — so a
// level is one more of whatever the line already leads with.
const LIST_LINE = /^([*#]+)\s/
const shift = (m, deeper) =>
  mapBlock(m, (line) => {
    const at = LIST_LINE.exec(line)
    if (!at) return line
    if (deeper) return at[1][0] + line
    return at[1].length > 1 ? line.slice(1) : line
  })

// A 2×2 skeleton with the first heading selected, so it is typed over.
const TABLE = ['||Column||Column||', '| | |', ''].join('\n')
const table = (m) => insertBlock(m, TABLE, { at: 2, length: 6 })

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
  if (id === 'indent' || id === 'outdent') return shift(m, id === 'indent')
  if (id === 'table') return table(m)
  if (id === 'link') return link(m)
  return null
}
