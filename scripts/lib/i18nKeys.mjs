// Static key extraction for the i18n guard. Pure string work, so what the guard
// can and cannot see is testable without walking the tree.
//
// A regex rather than a parse: the alternative is running the Vue SFC compiler
// and an ESTree walk over every file to find calls that are, in practice,
// always written `t('literal')`. The blind spot that buys — a key built at
// runtime — is not ignored, it is REPORTED by dynamicKeyLines below.

// `(?<![\w$.])` so `format(`, `split(`, `await import(` and any identifier that
// merely ends in "t" are not read as translation calls.
const LITERAL_KEY = /(?<![\w$.])\$?t\(\s*(['"])([^'"]+)\1/gu
// Anything that is NOT a quoted literal: a template literal or a variable. Both
// are invisible to the scan above, and a variable reads like an ordinary call —
// files.js does `t(spec.titleKey)`, which only the unused-key warning caught.
const DYNAMIC_KEY = /(?<![\w$.])\$?t\(\s*[^'")\s]/u
// Prose ABOUT t() is not a call site — JSDoc describing it was reported as one.
const COMMENT = /^\s*(\/\/|\/?\*)/u
// utils/ is pure and cannot call t(), so it exports key IDs on a `*Key` property
// and the caller resolves them (SHORTCUT_GROUPS, EXPORT_FORMATS). A dotted value
// is required: `sortKey: 'name'` is not a catalogue reference.
const KEY_PROP = /\b\w*Key:\s*(['"])([\w$]+(?:\.[\w$]+)+)\1/gu

/**
 * @param {string} source a .js or .vue file's text
 * @returns {string[]} the literal keys it translates, sorted and de-duplicated
 */
export function keysUsedIn(source) {
  const found = new Set()
  for (const [, , key] of source.matchAll(LITERAL_KEY)) found.add(key)
  for (const [, , key] of source.matchAll(KEY_PROP)) found.add(key)
  return [...found].sort()
}

/**
 * Keys the guard cannot resolve, so they can be listed rather than assumed
 * absent.
 *
 * @param {string} source
 * @returns {{ line: number, text: string }[]}
 */
export function dynamicKeyLines(source) {
  return source
    .split('\n')
    .map((text, i) => ({ line: i + 1, text: text.trim() }))
    .filter(({ text }) => !COMMENT.test(text) && DYNAMIC_KEY.test(text))
}

/**
 * @param {object} tree a message catalogue
 * @returns {string[]} every leaf as a dotted path, sorted
 */
export function catalogueKeys(tree, prefix = '') {
  const out = []
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object') out.push(...catalogueKeys(value, path))
    else out.push(path)
  }
  return out.sort()
}
