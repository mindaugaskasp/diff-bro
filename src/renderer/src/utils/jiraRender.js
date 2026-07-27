// Parse Jira / Confluence wiki markup into a block tree so the editor can show a
// *rendered* preview. The tree is rendered by JiraRendered/JiraInline as real
// DOM elements with text interpolation — never HTML injection — so this stays on
// the right side of the no-`v-html`/`innerHTML` rule (see CLAUDE.md §7). It is
// pure and best-effort: bounded to the notation the toolbar produces (utils/
// jiraMarkup.js) plus common extras, and a thing it can't parse just lands as
// text rather than throwing.
//
// Block nodes:  heading{level,inlines} · paragraph{lines:[inlines]} ·
//   list{ordered,items:[{depth,inlines}]} · quote{children:[blocks]} · code{code}
// Inline nodes: text{value} · strong/em/ins/del{inlines} · code{value} ·
//   link{label,href}

const HEADING = /^h([1-6])\.\s+(.*)$/
const QUOTE_LINE = /^bq\.\s+(.*)$/
// Lists are `*` (bulleted) or `#` (numbered), one or more for nesting depth. `-`
// is deliberately excluded — it is the strikethrough marker, not a list bullet.
const LIST_LINE = /^([*#]+)\s+(.*)$/
const CODE_OPEN = /^\{code(?::[^}]*)?\}$/
const QUOTE_OPEN = /^\{quote\}$/

// --- inline -------------------------------------------------------------
const EMPHASIS = { '*': 'strong', _: 'em', '+': 'ins', '-': 'del' }
const WORD = /[A-Za-z0-9]/

function linkNode(inner) {
  const pipe = inner.indexOf('|')
  const label = pipe === -1 ? inner : inner.slice(0, pipe)
  const href = pipe === -1 ? inner : inner.slice(pipe + 1)
  return { type: 'link', label, href }
}

// The matching emphasis close for the marker at `open`: another same marker that
// isn't glued to a word, wrapping non-empty content with no edge spaces (Jira's
// word-boundary rule, which keeps hyphens/underscores in prose from lighting up).
function findClose(text, open, ch) {
  for (let j = open + 1; j < text.length; j++) {
    if (text[j] !== ch) continue
    const after = text[j + 1]
    if (after !== undefined && WORD.test(after)) continue
    const inner = text.slice(open + 1, j)
    if (inner && inner[0] !== ' ' && inner.at(-1) !== ' ') return j
  }
  return -1
}

function matchEmphasis(text, i) {
  const kind = EMPHASIS[text[i]]
  if (!kind) return null
  const before = text[i - 1]
  if (before !== undefined && WORD.test(before)) return null
  const close = findClose(text, i, text[i])
  if (close === -1) return null
  return { length: close - i + 1, node: { type: kind, inlines: parseInline(text.slice(i + 1, close)) } }
}

function matchInline(text, i) {
  const rest = text.slice(i)
  const mono = /^\{\{(.+?)\}\}/.exec(rest)
  if (mono) return { length: mono[0].length, node: { type: 'code', value: mono[1] } }
  const link = /^\[([^\]]+?)\]/.exec(rest)
  if (link) return { length: link[0].length, node: linkNode(link[1]) }
  return matchEmphasis(text, i)
}

export function parseInline(text) {
  const nodes = []
  let buf = ''
  const flush = () => {
    if (buf) nodes.push({ type: 'text', value: buf })
    buf = ''
  }
  let i = 0
  while (i < text.length) {
    const token = matchInline(text, i)
    if (token) {
      flush()
      nodes.push(token.node)
      i += token.length
    } else {
      buf += text[i]
      i++
    }
  }
  flush()
  return nodes
}

// --- blocks -------------------------------------------------------------
const isSpecial = (line) =>
  HEADING.test(line) || QUOTE_LINE.test(line) || LIST_LINE.test(line)
const isFenceOpen = (t) => CODE_OPEN.test(t) || QUOTE_OPEN.test(t)

function consumeFence(lines, i, blocks) {
  const kind = CODE_OPEN.test(lines[i].trim()) ? 'code' : 'quote'
  const closer = kind === 'code' ? '{code}' : '{quote}'
  const inner = []
  i++
  while (i < lines.length && lines[i].trim() !== closer) inner.push(lines[i++])
  if (i < lines.length) i++ // drop the closing fence
  if (kind === 'code') blocks.push({ type: 'code', code: inner.join('\n') })
  else blocks.push({ type: 'quote', children: parseJira(inner.join('\n')) })
  return i
}

function consumeQuoteLines(lines, i, blocks) {
  const inner = []
  let m
  while (i < lines.length && (m = QUOTE_LINE.exec(lines[i]))) {
    inner.push(m[1])
    i++
  }
  blocks.push({ type: 'quote', children: parseJira(inner.join('\n')) })
  return i
}

function consumeList(lines, i, blocks) {
  const ordered = LIST_LINE.exec(lines[i])[1].endsWith('#')
  const items = []
  let m
  while (i < lines.length && (m = LIST_LINE.exec(lines[i])) && m[1].endsWith('#') === ordered) {
    items.push({ depth: m[1].length, inlines: parseInline(m[2]) })
    i++
  }
  blocks.push({ type: 'list', ordered, items })
  return i
}

function consumeParagraph(lines, i, blocks) {
  const para = []
  while (i < lines.length && lines[i].trim() !== '' && !isSpecial(lines[i]) && !isFenceOpen(lines[i].trim())) {
    para.push(parseInline(lines[i]))
    i++
  }
  blocks.push({ type: 'paragraph', lines: para })
  return i
}

function consumeBlock(lines, i, blocks) {
  const line = lines[i]
  const t = line.trim()
  if (t === '') return i + 1
  if (isFenceOpen(t)) return consumeFence(lines, i, blocks)
  const m = HEADING.exec(line)
  if (m) {
    blocks.push({ type: 'heading', level: +m[1], inlines: parseInline(m[2]) })
    return i + 1
  }
  if (QUOTE_LINE.test(line)) return consumeQuoteLines(lines, i, blocks)
  if (LIST_LINE.test(line)) return consumeList(lines, i, blocks)
  return consumeParagraph(lines, i, blocks)
}

export function parseJira(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) i = consumeBlock(lines, i, blocks)
  return blocks
}
