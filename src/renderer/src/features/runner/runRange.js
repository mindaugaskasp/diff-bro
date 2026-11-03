// A lexer, not a parser package: tree-sitter grammars are WASM and an audit
// surface for a question answered by strings, comments, brackets and indent.

const SYNTAX = {
  python: {
    comments: ['#'],
    block: null,
    quotes: ['"""', "'''", '"', "'"],
    spanning: ['"""', "'''"]
  },
  php: { comments: ['//', '#'], block: ['/*', '*/'], quotes: ['"', "'"], spanning: ['"', "'"] }
}
const OPENERS = '([{'
const CLOSERS = ')]}'
const PHP_OPEN_TAG = /^\s*<\?php\b/

const startsAt = (line, i, tokens) => tokens.find((t) => line.startsWith(t, i))

function stepInside(line, i, inside) {
  if (inside.escapes && line[i] === '\\') return { i: i + 2, inside }
  if (line.startsWith(inside.close, i)) return { i: i + inside.close.length, inside: null }
  return { i: i + 1, inside }
}

function stepOutside(line, i, syntax, info) {
  if (startsAt(line, i, syntax.comments)) return { i: line.length, inside: null }
  if (syntax.block && line.startsWith(syntax.block[0], i)) {
    return { i: i + 2, inside: { close: syntax.block[1], escapes: false } }
  }
  const quote = startsAt(line, i, syntax.quotes)
  const ch = line[i]
  if (ch.trim()) Object.assign(info, { hasCode: true, lastChar: ch })
  if (quote) return { i: i + quote.length, inside: { close: quote, escapes: true } }
  if (OPENERS.includes(ch)) info.depth++
  if (CLOSERS.includes(ch)) info.depth = Math.max(0, info.depth - 1)
  return { i: i + 1, inside: null }
}

function scanLine(line, syntax, carried) {
  const info = {
    startsInside: !!carried.inside,
    hasCode: false,
    lastChar: '',
    depth: carried.depth
  }
  let { inside } = carried
  let i = 0
  while (i < line.length) {
    ;({ i, inside } = inside ? stepInside(line, i, inside) : stepOutside(line, i, syntax, info))
  }
  if (inside && !syntax.spanning.includes(inside.close) && inside.close !== syntax.block?.[1]) {
    inside = null
  }
  info.openAtEnd = !!inside
  info.indent = line.length - line.trimStart().length
  info.text = line
  return { info, carried: { inside, depth: info.depth } }
}

/** @returns {object[]} one entry per line, 1-based (index 0 unused) */
function scan(text, syntax) {
  const infos = [null]
  let carried = { inside: null, depth: 0 }
  for (const line of text.split('\n')) {
    const step = scanLine(line, syntax, carried)
    infos.push(step.info)
    carried = step.carried
  }
  return infos
}

const isRunnable = (language, infos, n) => {
  const info = infos[n]
  if (!info?.hasCode || info.startsInside) return false
  return !(language === 'php' && PHP_OPEN_TAG.test(info.text))
}

const isOpen = (info) => info.depth > 0 || info.openAtEnd || info.text.trimEnd().endsWith('\\')

function closeOpen(infos, from) {
  let j = from
  while (j < infos.length - 1 && isOpen(infos[j])) j++
  return j
}

function nextCodeLine(infos, after) {
  for (let j = after + 1; j < infos.length; j++) if (infos[j].hasCode) return j
  return null
}

function pythonLast(infos, n) {
  let start = n
  while (start > 1 && (infos[start].startsInside || isOpen(infos[start - 1]))) start--
  let last = closeOpen(infos, n)
  while (infos[start].text.trim().startsWith('@')) {
    const next = nextCodeLine(infos, last)
    if (!next) break
    start = next
    last = closeOpen(infos, next)
  }
  const indent = infos[start].indent
  for (let j = last + 1; j < infos.length; j++) {
    if (!infos[j].hasCode) continue
    if (infos[j].indent <= indent) break
    last = closeOpen(infos, j)
    j = last
  }
  return last
}

const endsStatement = (info) => info.hasCode && (info.lastChar === ';' || info.lastChar === '}')

function phpLast(infos, n) {
  let j = n
  while (j < infos.length - 1 && (isOpen(infos[j]) || !endsStatement(infos[j]))) j++
  return j
}

const LAST_LINE = { python: pythonLast, php: phpLast }

// One snippet is hovered many times between edits; scanning once per text keeps that cheap.
let memo = { language: null, text: null, infos: null }
function scanned(language, text) {
  if (memo.language !== language || memo.text !== text) {
    memo = { language, text, infos: scan(text, SYNTAX[language]) }
  }
  return memo.infos
}

/**
 * @param {string} language
 * @param {string} text
 * @returns {Set<number>} the 1-based lines that get a play button
 */
export function runnableLines(language, text) {
  if (!SYNTAX[language]) return new Set()
  const infos = scanned(language, text)
  const lines = new Set()
  for (let n = 1; n < infos.length; n++) if (isRunnable(language, infos, n)) lines.add(n)
  return lines
}

/**
 * @param {string} language
 * @param {string} text
 * @param {number} line  the 1-based line pressed
 * @returns {number|null} the last line a press runs, null when that line gets no button
 */
export function lastLineFor(language, text, line) {
  if (!SYNTAX[language]) return null
  const infos = scanned(language, text)
  return isRunnable(language, infos, line) ? LAST_LINE[language](infos, line) : null
}

/**
 * @param {string} language
 * @param {string} text
 * @param {number} line  the 1-based line pressed
 * @returns {{ code: string, last: number } | null} null when that line gets no button
 */
export function codeThrough(language, text, line) {
  const last = lastLineFor(language, text, line)
  if (last === null) return null
  return { code: text.split('\n').slice(0, last).join('\n'), last }
}
