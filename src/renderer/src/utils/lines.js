// Pure line-list operations for the Lines tool: clean up (trim, drop blanks,
// dedupe keep-first), sort, plain (non-regex) per-line find/replace, then wrap
// each line and join — e.g. a paste of UUIDs into a SQL IN-clause list. Vue-free
// so it stays unit-testable.

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
 * @property {string} find          literal substring to replace (non-regex)
 * @property {string} replace       replacement for `find`
 * @property {string} prefix        prepended to every line
 * @property {string} suffix        appended to every line
 * @property {string} separator     inserted between lines when joining
 */

/**
 * @param {string} text
 * @param {LineOpts} o
 * @returns {{ output: string, count: { in: number, out: number, dupes: number } }}
 */
export function processLines(text, o) {
  const byLine = text === '' ? [] : text.split(/\r?\n/)
  const raw = o.splitBy ? byLine.flatMap((l) => l.split(o.splitBy)) : byLine
  let lines = raw
  if (o.trim) lines = lines.map((l) => l.trim())
  if (o.find) lines = lines.map((l) => l.replaceAll(o.find, o.replace))
  if (o.dropBlank) lines = lines.filter((l) => l !== '')
  let dupes = 0
  if (o.dedupe) {
    const before = lines.length
    lines = dedupe(lines)
    dupes = before - lines.length
  }
  if (o.sort !== 'none') lines = [...lines].sort(comparator(o.sort))
  const output = lines.map((l) => `${o.prefix}${l}${o.suffix}`).join(o.separator)
  return { output, count: { in: raw.length, out: lines.length, dupes } }
}
