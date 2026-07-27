// Jira / Confluence wiki-markup transforms behind the snippet editor's
// formatting toolbar. Each action takes the editor's whole text plus the current
// selection offsets and returns the new text and where the selection should land
// afterwards. No Monaco, no DOM — pure string work, so every button's behaviour
// (wrap, toggle, per-line prefix, caret placement) is unit-testable. The
// composable that owns the Monaco editor just converts its selection to offsets
// and applies the result.
//
// The notation is the classic Atlassian one shared by Jira and legacy Confluence
// wiki markup: *bold*, _italic_, +underline+, -strike-, {{monospace}}, hN.
// headings, `#`/`*` lists, bq. quote, {code} blocks, [text|url] links. Alignment
// has no reliable wiki-markup form, so it is deliberately not offered.

// The toolbar buttons, in display order. `icon` names an AppIcon; `text` is a
// short label used where a glyph reads clearer than a pictogram (the headings).
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

const selected = (m) => m.text.slice(m.start, m.end)
const head = (m) => m.text.slice(0, m.start)
const tail = (m) => m.text.slice(m.end)

// Replace the selection with `text`, landing the new selection at [selStart, selEnd].
function splice(m, text, selStart, selEnd) {
  return { text: head(m) + text + tail(m), start: selStart, end: selEnd }
}

// Inline wrap with toggle-off: strip the markers when they already surround the
// selection (inside it, or immediately outside it), otherwise add them.
function wrap(m, prefix, suffix) {
  const sel = selected(m)
  if (sel.length >= prefix.length + suffix.length && sel.startsWith(prefix) && sel.endsWith(suffix)) {
    const inner = sel.slice(prefix.length, sel.length - suffix.length)
    return splice(m, inner, m.start, m.start + inner.length)
  }
  if (head(m).endsWith(prefix) && tail(m).startsWith(suffix)) {
    const text = head(m).slice(0, -prefix.length) + sel + tail(m).slice(suffix.length)
    return { text, start: m.start - prefix.length, end: m.end - prefix.length }
  }
  return splice(m, prefix + sel + suffix, m.start + prefix.length, m.start + prefix.length + sel.length)
}

// Grow the selection to the whole lines it touches, so a per-line prefix never
// starts from mid-line.
function lineBounds(m) {
  const start = m.text.lastIndexOf('\n', m.start - 1) + 1
  const nl = m.text.indexOf('\n', m.end)
  return { start, end: nl === -1 ? m.text.length : nl }
}

// A single leading marker (hN. / bq.) that replaces any existing one, or clears
// it when the same marker is clicked again.
function heading(m, marker) {
  const { start, end } = lineBounds(m)
  const block = m.text.slice(start, end)
  const bare = block.replace(HEADING_RE, '')
  const next = block.startsWith(`${marker} `) ? bare : `${marker} ${bare}`
  return { text: m.text.slice(0, start) + next + m.text.slice(end), start, end: start + next.length }
}

// A per-line list marker: add it to every non-blank line, or remove it from all
// of them when every line already has it (toggle).
function listBlock(m, marker) {
  const { start, end } = lineBounds(m)
  const token = `${marker} `
  const lines = m.text.slice(start, end).split('\n')
  const nonBlank = lines.filter((l) => l.trim() !== '')
  const allMarked = nonBlank.length > 0 && nonBlank.every((l) => l.startsWith(token))
  const next = lines
    .map((l) => (l.trim() === '' ? l : allMarked ? l.slice(token.length) : token + l))
    .join('\n')
  return { text: m.text.slice(0, start) + next + m.text.slice(end), start, end: start + next.length }
}

// A {code} block wrapping the selection on its own lines; the inner content is
// selected (or the caret lands on the empty inner line).
function codeBlock(m) {
  const sel = selected(m)
  const opener = '{code}\n'
  return splice(m, `${opener}${sel}\n{code}`, m.start + opener.length, m.start + opener.length + sel.length)
}

// [text|url]: with a selection, keep it as the label and land the caret in the
// empty url slot; with none, insert a placeholder and select "text".
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
  if (HEADINGS[id]) return heading(m, HEADINGS[id])
  if (LISTS[id]) return listBlock(m, LISTS[id])
  if (id === 'codeblock') return codeBlock(m)
  if (id === 'link') return link(m)
  return null
}
