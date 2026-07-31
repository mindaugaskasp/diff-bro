// Replace runs per line, which is what makes `^`/`$` anchors useful here; a
// pattern meant to span newlines is the one thing this cannot express.
import { replaceText } from './findReplace'

export const SORTS = ['none', 'asc', 'desc', 'natural']

const collate = new Intl.Collator(undefined, { sensitivity: 'variant' })
const collateNatural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'variant' })

function comparator(sort) {
  if (sort === 'natural') return collateNatural.compare
  if (sort === 'desc') return (a, b) => collate.compare(b, a)
  return collate.compare
}

function dedupe(lines) {
  const seen = new Set()
  return lines.filter((l) => (seen.has(l) ? false : seen.add(l)))
}

/**
 * @typedef {Object} LineOpts
 * @property {string} splitBy       literal delimiter to also explode each line on (besides newlines)
 * @property {boolean} trim         trim each line
 * @property {boolean} dropBlank    drop empty lines
 * @property {boolean} dedupe       drop repeats, keeping the first
 * @property {'none'|'asc'|'desc'|'natural'} sort
 * @property {string} find          what to match, read per `mode`
 * @property {string} replace       replacement for `find` ($1 works in regex mode)
 * @property {'text'|'word'|'regex'} mode  literal, whole-word, or regular expression
 * @property {boolean} caseInsensitive     match without regard to case
 * @property {string} prefix        prepended to every line
 * @property {string} suffix        appended to every line
 * @property {string} separator     inserted between lines when joining
 */

// A bad regex is the same bad regex on every line, so the first failure ends it.
function applyReplace(lines, o) {
  const out = []
  let replaced = 0
  for (const line of lines) {
    const res = replaceText({
      text: line,
      find: o.find,
      replace: o.replace,
      mode: o.mode,
      caseInsensitive: o.caseInsensitive
    })
    if (res.error) return { error: res.error }
    out.push(res.output)
    replaced += res.count
  }
  return { lines: out, replaced }
}

/**
 * @param {string} text
 * @param {LineOpts} o
 * @returns {{ output: string, count: { in: number, out: number, dupes: number,
 *            replaced: number } } | { error: string }}
 */
export function processLines(text, o) {
  const byLine = text === '' ? [] : text.split(/\r?\n/)
  const raw = o.splitBy ? byLine.flatMap((l) => l.split(o.splitBy)) : byLine
  let lines = raw
  if (o.trim) lines = lines.map((l) => l.trim())

  let replaced = 0
  if (o.find) {
    const res = applyReplace(lines, o)
    if (res.error) return { error: res.error }
    lines = res.lines
    replaced = res.replaced
  }

  if (o.dropBlank) lines = lines.filter((l) => l !== '')
  let dupes = 0
  if (o.dedupe) {
    const before = lines.length
    lines = dedupe(lines)
    dupes = before - lines.length
  }
  if (o.sort !== 'none') lines = [...lines].sort(comparator(o.sort))
  const output = lines.map((l) => `${o.prefix}${l}${o.suffix}`).join(o.separator)
  return { output, count: { in: raw.length, out: lines.length, dupes, replaced } }
}
