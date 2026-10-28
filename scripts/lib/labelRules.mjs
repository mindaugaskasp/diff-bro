// The naming guide's checkable half (docs/standards.md, "Labels and menus"):
// menu items are Title Case, and wording the guide retired stays retired.

const SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'vs'
])

const RETIRED = [
  [/\bsend my (public )?key\b/i, 'Share is the verb for your key'],
  [/\bexport my public key\b/i, 'Share is the verb for your key'],
  [/\bpaste text mode\b/i, 'it is Paste mode'],
  [/\bsave (snippet )?as file\b/i, 'writing to disk is Export']
]

const isTitleCase = (label) =>
  label
    .split(/\s+/)
    .filter((word) => /^[a-z]/i.test(word))
    .every((word, i) => i === 0 || SMALL_WORDS.has(word) || /^[A-Z]/.test(word))

function leaves(tree, prefix = '') {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return value && typeof value === 'object' ? leaves(value, path) : [[path, value]]
  })
}

/**
 * @param {object} tree the English catalogue
 * @returns {string[]} one line per label that breaks the guide
 */
export function labelProblems(tree) {
  const out = []
  for (const [path, value] of leaves(tree)) {
    if (typeof value !== 'string') continue
    if (path.startsWith('menu.') && !isTitleCase(value)) {
      out.push(`${path}: menu items are Title Case (${JSON.stringify(value)})`)
    }
    for (const [pattern, why] of RETIRED) {
      const hit = value.match(pattern)
      if (hit) out.push(`${path}: retired wording ${JSON.stringify(hit[0])} (${why})`)
    }
  }
  return out
}
