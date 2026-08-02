// The regex tester's engine. Pure: no Vue, no DOM — it returns SEGMENTS, never
// markup, because the highlighted subject is rendered through Vue's text
// interpolation and `v-html` is banned (CLAUDE.md rule 8).

export const FLAGS = ['g', 'i', 'm', 's', 'u', 'y']

// A pattern is untrusted input in the only sense that matters here: the person
// typing it can hang their own window. `(a+)+$` against a few hundred
// characters backtracks for longer than anyone will wait, and a renderer
// blocked in RegExp.exec cannot be interrupted — no timer, no frame, nothing.
// So the loop is time-boxed and the result says it gave up.
export const MAX_SUBJECT = 200_000
export const MAX_MATCHES = 5000
export const TIME_BUDGET_MS = 250

/**
 * @typedef {object} RegexMatch
 * @property {number} index
 * @property {string} text
 * @property {Array<{ name: string, value: string|undefined }>} groups
 */

/**
 * @typedef {object} RegexResult
 * @property {string} [error]        an invalid pattern, said the way JS says it
 * @property {RegexMatch[]} matches
 * @property {Array<{ text: string, match: boolean }>} segments  the subject, split
 * @property {boolean} truncated     the budget ran out before the subject did
 * @property {boolean} capped        MAX_MATCHES reached
 */

const groupsOf = (m) => {
  const out = []
  for (let i = 1; i < m.length; i++) out.push({ name: String(i), value: m[i] })
  for (const [name, value] of Object.entries(m.groups ?? {})) out.push({ name, value })
  return out
}

// Every match, folded into a running split of the subject. Both ceilings live
// here: a pattern the person typed can hang their own window, and a renderer
// blocked inside RegExp.exec cannot be interrupted by anything.
function scan(re, text, now) {
  const walk = { matches: [], segments: [], cursor: 0, capped: false, truncated: false }
  const started = now()
  for (let m = re.exec(text); m; m = re.exec(text)) {
    walk.capped = walk.matches.length >= MAX_MATCHES
    walk.truncated = !walk.capped && now() - started > TIME_BUDGET_MS
    if (walk.capped || walk.truncated) break
    take(walk, text, m)
    // A zero-width match never advances lastIndex on its own — the loop would
    // spin on it forever.
    if (!m[0]) re.lastIndex += 1
  }
  if (walk.cursor < text.length) walk.segments.push({ text: text.slice(walk.cursor), match: false })
  return walk
}

// One match, folded into the running split of the subject.
function take(walk, text, m) {
  if (m.index > walk.cursor) {
    walk.segments.push({ text: text.slice(walk.cursor, m.index), match: false })
  }
  if (m[0]) walk.segments.push({ text: m[0], match: true })
  walk.matches.push({ index: m.index, text: m[0], groups: groupsOf(m) })
  walk.cursor = m.index + m[0].length
}

const compile = (pattern, flags) => {
  // Always global: the segment walk needs lastIndex to advance, and a tester
  // that showed only the first match would be answering a different question.
  const wanted = new Set([...(flags ?? []), 'g'])
  return new RegExp(pattern, [...wanted].join(''))
}

/**
 * @param {string} pattern
 * @param {string[]} flags
 * @param {string} subject
 * @param {{ now?: () => number }} [opts]
 * @returns {RegexResult}
 */
export function runRegex(pattern, flags, subject, { now = () => Date.now() } = {}) {
  const text = String(subject ?? '').slice(0, MAX_SUBJECT)
  const empty = {
    matches: [],
    segments: text ? [{ text, match: false }] : [],
    truncated: false,
    capped: false
  }
  if (!pattern) return empty

  let re
  try {
    re = compile(pattern, flags)
  } catch (e) {
    return { ...empty, error: e.message }
  }

  const walk = scan(re, text, now)

  const { matches, segments, truncated, capped } = walk
  return { matches, segments, truncated, capped }
}

/**
 * The subject with every match replaced. `$1`/`$<name>` work because this is
 * String.replace — the same substitution rules the pattern author expects.
 * @param {string} pattern
 * @param {string[]} flags
 * @param {string} subject
 * @param {string} replacement
 * @returns {{ output: string }|{ error: string }}
 */
export function replaceAll(pattern, flags, subject, replacement) {
  const text = String(subject ?? '').slice(0, MAX_SUBJECT)
  if (!pattern) return { output: text }
  try {
    return { output: text.replace(compile(pattern, flags), String(replacement ?? '')) }
  } catch (e) {
    return { error: e.message }
  }
}
