// en-XA, the generated pseudolocale. It is not a translation and nobody reads
// it as one — it exists so a CI run can SEE three things a unit test cannot:
//
//   1. text that was never extracted   → it stays plain ASCII among accents
//   2. a container that cannot grow    → the padding overflows it
//   3. a broken interpolation          → the placeholder is preserved verbatim,
//                                        so a mangled one reads as literal text
//
// Deterministic by construction: same input, same output, so the committed
// en-XA.json has a stable diff and `--check` can fail on a stale one.

const ACCENTS = {
  a: 'à',
  b: 'ƀ',
  c: 'ç',
  d: 'đ',
  e: 'é',
  f: 'ƒ',
  g: 'ğ',
  h: 'ĥ',
  i: 'ĩ',
  j: 'ĵ',
  k: 'ķ',
  l: 'ł',
  m: 'ɱ',
  n: 'ń',
  o: 'ō',
  p: 'ƥ',
  q: 'ɋ',
  r: 'ř',
  s: 'ş',
  t: 'ţ',
  u: 'ū',
  v: 'ṽ',
  w: 'ŵ',
  x: 'ẋ',
  y: 'ŷ',
  z: 'ž',
  A: 'À',
  B: 'Ɓ',
  C: 'Ç',
  D: 'Đ',
  E: 'É',
  F: 'Ƒ',
  G: 'Ğ',
  H: 'Ĥ',
  I: 'Ĩ',
  J: 'Ĵ',
  K: 'Ķ',
  L: 'Ł',
  M: 'Ṁ',
  N: 'Ń',
  O: 'Ō',
  P: 'Ƥ',
  Q: 'Ɋ',
  R: 'Ř',
  S: 'Š',
  T: 'Ţ',
  U: 'Ū',
  V: 'Ṽ',
  W: 'Ŵ',
  X: 'Ẋ',
  Y: 'Ŷ',
  Z: 'Ž'
}

// Roughly what German and Finnish do to short English UI strings.
const PADDING = '·øé'
const PAD_RATIO = 0.4

// Split on the two things that are message SYNTAX rather than text: an
// interpolation placeholder and the plural separator. Accenting either breaks
// the message — `{name}` stops resolving, `|` stops separating.
// Two patterns, not one: a /g/ regex carries lastIndex between calls, so the
// classifying test has to be stateless or it answers about the wrong offset.
const SYNTAX_SPLIT = /(\{[^}]*\}|\|)/gu
const IS_SYNTAX = /^(\{[^}]*\}|\|)$/u

const accent = (s) => s.replace(/[a-z]/giu, (c) => ACCENTS[c] ?? c)

const padFor = (text) => {
  const letters = text.replace(/[^\p{L}]/gu, '').length
  const want = Math.ceil(letters * PAD_RATIO)
  let out = ''
  while (out.length < want) out += PADDING[out.length % PADDING.length]
  return out
}

/**
 * @param {string} message
 * @returns {string} the same message, accented, padded and bracketed
 */
export function pseudoText(message) {
  const parts = String(message).split(SYNTAX_SPLIT)
  const body = parts.map((part) => (IS_SYNTAX.test(part) ? part : accent(part))).join('')
  const pad = padFor(message)
  return `[${body}${pad ? ` ${pad}` : ''}]`
}

/**
 * @param {object} tree a message catalogue
 * @returns {object} the same shape with every leaf pseudo-localized
 */
export function pseudoTree(tree) {
  const out = {}
  for (const [key, value] of Object.entries(tree)) {
    out[key] = value && typeof value === 'object' ? pseudoTree(value) : pseudoText(value)
  }
  return out
}
