// Parse a useful subset of Markdown into the SAME block tree jiraRender emits, so
// the shared renderer (JiraRendered/JiraInline) draws it as real DOM via
// interpolation, never v-html (rule 7). Pure, best-effort — anything it can't
// parse lands as text.

const HEADING = /^(#{1,6})\s+(.*)$/
const QUOTE_LINE = /^>\s?(.*)$/
const UL_LINE = /^(\s*)[-*+]\s+(.*)$/
const OL_LINE = /^(\s*)\d+[.)]\s+(.*)$/
const FENCE = /^(```|~~~)/
// A table needs its separator row to BE a table — `| a | b |` on its own is a
// paragraph that happens to contain pipes, which is how prose about shell
// pipelines used to turn into a one-row table.
const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_RULE = /^\s*\|(?:\s*:?-{1,}:?\s*\|)+\s*$/
// `- [ ] item` / `- [x] item`
const TASK = /^\[([ xX])\]\s+(.*)$/

// --- inline -------------------------------------------------------------
function matchInline(text, i) {
  const rest = text.slice(i)
  const code = /^`([^`]+)`/.exec(rest)
  if (code) return { length: code[0].length, node: { type: 'code', value: code[1] } }
  const link = /^\[([^\]]*)\]\(([^)\s]*)\)/.exec(rest)
  if (link) return { length: link[0].length, node: { type: 'link', label: link[1], href: link[2] } }
  const strong = /^\*\*(.+?)\*\*/.exec(rest) || /^__(.+?)__/.exec(rest)
  if (strong)
    return { length: strong[0].length, node: { type: 'strong', inlines: parseInline(strong[1]) } }
  const em = /^\*(.+?)\*/.exec(rest) || /^_(.+?)_/.exec(rest)
  if (em) return { length: em[0].length, node: { type: 'em', inlines: parseInline(em[1]) } }
  // GFM strikethrough. `del` is the node the shared inline renderer already
  // draws for Jira's -text-, so both languages cross out the same way.
  const del = /^~~(.+?)~~/.exec(rest)
  if (del) return { length: del[0].length, node: { type: 'del', inlines: parseInline(del[1]) } }
  return null
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
  HEADING.test(line) || QUOTE_LINE.test(line) || UL_LINE.test(line) || OL_LINE.test(line)
const depthOf = (indent) => Math.floor(indent.length / 2) + 1

function consumeFence(lines, i, blocks) {
  const fence = lines[i].trim().slice(0, 3)
  const inner = []
  i++
  while (i < lines.length && !lines[i].trim().startsWith(fence)) inner.push(lines[i++])
  if (i < lines.length) i++ // drop the closing fence
  blocks.push({ type: 'code', code: inner.join('\n') })
  return i
}

function consumeQuote(lines, i, blocks) {
  const inner = []
  let m
  while (i < lines.length && (m = QUOTE_LINE.exec(lines[i]))) {
    inner.push(m[1])
    i++
  }
  blocks.push({ type: 'quote', children: parseMarkdown(inner.join('\n')) })
  return i
}

// A bullet whose text opens with a checkbox is a task, and carries its state.
function listItem(indent, text) {
  const task = TASK.exec(text)
  const body = task ? task[2] : text
  const item = { depth: depthOf(indent), inlines: parseInline(body) }
  return task ? { ...item, task: true, checked: task[1] !== ' ' } : item
}

function consumeList(lines, i, blocks, ordered) {
  const re = ordered ? OL_LINE : UL_LINE
  const items = []
  let m
  while (i < lines.length && (m = re.exec(lines[i]))) {
    items.push(listItem(m[1], m[2]))
    i++
  }
  blocks.push({ type: 'list', ordered, items })
  return i
}

// `| a | b |` split on the pipes, with the outer pair dropped.
const cells = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())

// Alignment is the separator's own colons — the one piece of a Markdown table
// that carries meaning rather than shape.
const alignOf = (cell) => {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  if (left && right) return 'center'
  return right ? 'right' : left ? 'left' : null
}

function consumeTable(lines, i, blocks) {
  const head = cells(lines[i]).map((c) => parseInline(c))
  const align = cells(lines[i + 1]).map(alignOf)
  i += 2
  const rows = []
  while (i < lines.length && TABLE_ROW.test(lines[i]) && !TABLE_RULE.test(lines[i])) {
    rows.push(cells(lines[i]).map((c) => parseInline(c)))
    i++
  }
  blocks.push({ type: 'table', align, head, rows })
  return i
}

function consumeParagraph(lines, i, blocks) {
  const para = []
  while (
    i < lines.length &&
    lines[i].trim() !== '' &&
    !isSpecial(lines[i]) &&
    !FENCE.test(lines[i].trim())
  ) {
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
  if (FENCE.test(t)) return consumeFence(lines, i, blocks)
  const h = HEADING.exec(line)
  if (h) {
    blocks.push({ type: 'heading', level: h[1].length, inlines: parseInline(h[2]) })
    return i + 1
  }
  if (QUOTE_LINE.test(line)) return consumeQuote(lines, i, blocks)
  if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[i + 1] ?? '')) {
    return consumeTable(lines, i, blocks)
  }
  if (OL_LINE.test(line)) return consumeList(lines, i, blocks, true)
  if (UL_LINE.test(line)) return consumeList(lines, i, blocks, false)
  return consumeParagraph(lines, i, blocks)
}

export function parseMarkdown(src) {
  const lines = String(src ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) i = consumeBlock(lines, i, blocks)
  return blocks
}
