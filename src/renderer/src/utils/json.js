// JSON shaping + a hand-rolled JSONPath subset for the JSON tool. Pure so it
// unit-tests without a DOM; ToolJson.vue is the only UI. String values (even ones
// that happen to hold JSON or XML) are never re-parsed — they stay verbatim.

export function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortDeep(value[k])])
    )
  }
  return value
}

export function stringifyJson(value, mode = 'pretty') {
  if (value === undefined) return ''
  if (mode === 'minify') return JSON.stringify(value)
  if (mode === 'sort') return JSON.stringify(sortDeep(value), null, 2)
  return JSON.stringify(value, null, 2)
}

// --- JSONPath subset --------------------------------------------------------
// $ root · .key / ['key'] child · [n] index · [*] / .* wildcard · ..key recurse.

// Regex groups: 1 recursive key, 2/3/4 child key (bare, 'quoted', "quoted"),
// 5 array index; a bare .* or [*] is the wildcard.
function stepFromMatch(m) {
  if (m[1] != null) return { t: 'recursive', k: m[1] }
  const key = m[2] ?? m[3] ?? m[4]
  if (key != null) return { t: 'child', k: key }
  if (m[5] != null) return { t: 'index', k: Number(m[5]) }
  return { t: 'wild' }
}

function tokenize(path) {
  let s = String(path).trim()
  if (s.startsWith('$')) s = s.slice(1)
  if (s && !s.startsWith('.') && !s.startsWith('[')) s = `.${s}`
  if (s === '') return []
  const re = /\.\.(\w+)|\.(\w+)|\.\*|\['([^']*)'\]|\["([^"]*)"\]|\[(\d+)\]|\[\*\]/y
  const tokens = []
  while (re.lastIndex < s.length) {
    const m = re.exec(s)
    if (!m) return null
    tokens.push(stepFromMatch(m))
  }
  return tokens
}

const childValues = (node) =>
  Array.isArray(node) ? node : node && typeof node === 'object' ? Object.values(node) : []

function recurse(node, key, out) {
  if (Array.isArray(node)) node.forEach((v) => recurse(v, key, out))
  else if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      if (k === key) out.push(node[k])
      recurse(node[k], key, out)
    }
  }
}

/**
 * Evaluate a JSONPath-subset expression against `root`.
 * @returns {{ matches: unknown[] } | { error: string }}
 */
const isPlainObject = (n) => n !== null && typeof n === 'object' && !Array.isArray(n)

// Apply one path step to one node, appending any matches to `out`.
function stepNode(tok, node, out) {
  if (tok.t === 'child') {
    if (isPlainObject(node) && tok.k in node) out.push(node[tok.k])
  } else if (tok.t === 'index') {
    if (Array.isArray(node) && tok.k < node.length) out.push(node[tok.k])
  } else if (tok.t === 'wild') {
    out.push(...childValues(node))
  } else {
    recurse(node, tok.k, out)
  }
}

export function jsonPath(root, path) {
  const tokens = tokenize(path)
  if (tokens === null) return { error: 'Unsupported path.' }
  let cur = [root]
  for (const tok of tokens) {
    const next = []
    for (const node of cur) stepNode(tok, node, next)
    cur = next
  }
  return { matches: cur }
}
