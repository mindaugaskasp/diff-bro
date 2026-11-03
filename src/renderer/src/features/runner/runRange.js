// A lexer, not a parser package: tree-sitter grammars are WASM and an audit
// surface for a question answered by strings, comments, brackets and indent.

const SYNTAX = {
  python: {
    comments: ['#'],
    block: null,
    quotes: ['"""', "'''", '"', "'"],
    multilineQuotes: ['"""', "'''"]
  },
  php: {
    comments: ['//', '#'],
    block: ['/*', '*/'],
    quotes: ['"', "'"],
    multilineQuotes: ['"', "'"]
  }
}
const OPENERS = '([{'
const CLOSERS = ')]}'
const PHP_OPEN_TAG = /^\s*<\?php\b/

/**
 * What one line leaves behind for the next.
 * @typedef {object} LineScan
 * @property {string} text
 * @property {number} indent
 * @property {boolean} startsInside  begins inside a string or block comment
 * @property {boolean} hasCode       carries code outside strings and comments
 * @property {string} lastChar       the last code character
 * @property {number} depth          brackets still open at its end
 * @property {boolean} openAtEnd     ends inside a string or block comment
 */

const tokenAt = (line, i, tokens) => tokens.find((t) => line.startsWith(t, i))

// Inside a string or comment: skip escapes, look for its end.
function stepInside(line, i, inside) {
  if (inside.escapes && line[i] === '\\') return { next: i + 2, inside }
  if (line.startsWith(inside.close, i)) return { next: i + inside.close.length, inside: null }
  return { next: i + 1, inside }
}

// Outside one: record code and brackets on `facts`, or enter a string or comment.
function stepOutside(line, i, syntax, facts) {
  if (tokenAt(line, i, syntax.comments)) return { next: line.length, inside: null }
  if (syntax.block && line.startsWith(syntax.block[0], i)) {
    return { next: i + 2, inside: { close: syntax.block[1], escapes: false } }
  }
  const ch = line[i]
  if (ch.trim()) Object.assign(facts, { hasCode: true, lastChar: ch })
  const quote = tokenAt(line, i, syntax.quotes)
  if (quote) return { next: i + quote.length, inside: { close: quote, escapes: true } }
  if (OPENERS.includes(ch)) facts.depth++
  if (CLOSERS.includes(ch)) facts.depth = Math.max(0, facts.depth - 1)
  return { next: i + 1, inside: null }
}

const canSpanLines = (syntax, inside) =>
  syntax.multilineQuotes.includes(inside.close) || inside.close === syntax.block?.[1]

function scanLine(line, syntax, carried) {
  const facts = {
    startsInside: !!carried.inside,
    hasCode: false,
    lastChar: '',
    depth: carried.depth
  }
  let { inside } = carried
  for (let i = 0; i < line.length;) {
    const step = inside ? stepInside(line, i, inside) : stepOutside(line, i, syntax, facts)
    i = step.next
    inside = step.inside
  }
  if (inside && !canSpanLines(syntax, inside)) inside = null
  /** @type {LineScan} */
  const scan = {
    ...facts,
    openAtEnd: !!inside,
    indent: line.length - line.trimStart().length,
    text: line
  }
  return { scan, carried: { inside, depth: facts.depth } }
}

/** @returns {LineScan[]} one per line, 1-based: index 0 is unused */
function scanText(text, syntax) {
  const scans = [null]
  let carried = { inside: null, depth: 0 }
  for (const line of text.split('\n')) {
    const step = scanLine(line, syntax, carried)
    scans.push(step.scan)
    carried = step.carried
  }
  return scans
}

// One snippet is hovered many times between edits; scanning once per text keeps that cheap.
let memo = { language: null, text: null, scans: null }

/** @returns {LineScan[]} */
export function lineScanFor(language, text) {
  if (memo.language !== language || memo.text !== text) {
    memo = { language, text, scans: scanText(text, SYNTAX[language]) }
  }
  return memo.scans
}

function isRunnable(language, scans, n) {
  const scan = scans[n]
  if (!scan?.hasCode || scan.startsInside) return false
  return !(language === 'php' && PHP_OPEN_TAG.test(scan.text))
}

const isOpen = (scan) => scan.depth > 0 || scan.openAtEnd || scan.text.trimEnd().endsWith('\\')

function continuationEnd(scans, from) {
  let n = from
  while (n < scans.length - 1 && isOpen(scans[n])) n++
  return n
}

function nextCodeLine(scans, after) {
  for (let n = after + 1; n < scans.length; n++) if (scans[n].hasCode) return n
  return null
}

// A decorator runs with the definition under it.
function pastDecorators(scans, head, last) {
  while (scans[head].text.trim().startsWith('@')) {
    const next = nextCodeLine(scans, last)
    if (!next) break
    head = next
    last = continuationEnd(scans, next)
  }
  return { head, last }
}

function pythonStatementEnd(scans, n) {
  let start = n
  while (start > 1 && (scans[start].startsInside || isOpen(scans[start - 1]))) start--
  const decorated = pastDecorators(scans, start, continuationEnd(scans, n))
  const blockIndent = scans[decorated.head].indent
  let last = decorated.last
  for (let j = last + 1; j < scans.length; j++) {
    if (!scans[j].hasCode) continue
    if (scans[j].indent <= blockIndent) break
    last = continuationEnd(scans, j)
    j = last
  }
  return last
}

const endsStatement = (scan) => scan.hasCode && (scan.lastChar === ';' || scan.lastChar === '}')

function phpStatementEnd(scans, n) {
  let last = n
  while (last < scans.length - 1 && (isOpen(scans[last]) || !endsStatement(scans[last]))) last++
  return last
}

const STATEMENT_END = { python: pythonStatementEnd, php: phpStatementEnd }

/**
 * @param {string} language
 * @param {string} text
 * @returns {Set<number>} the 1-based lines that get a play button
 */
export function runnableLines(language, text) {
  if (!SYNTAX[language]) return new Set()
  const scans = lineScanFor(language, text)
  const lines = new Set()
  for (let n = 1; n < scans.length; n++) if (isRunnable(language, scans, n)) lines.add(n)
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
  const scans = lineScanFor(language, text)
  return isRunnable(language, scans, line) ? STATEMENT_END[language](scans, line) : null
}

/**
 * @param {string} language
 * @param {string} text
 * @param {number} line  the 1-based line pressed
 * @returns {{ code: string, lastLine: number } | null} null when that line gets no button
 */
export function codeThrough(language, text, line) {
  const lastLine = lastLineFor(language, text, line)
  if (lastLine === null) return null
  return { code: text.split('\n').slice(0, lastLine).join('\n'), lastLine }
}
