// Structure-aware comparison. Both sides are parsed into plain values first, so
// key order and formatting are gone before anything is compared and only real
// differences survive. Pure: no Vue, no store, no Monaco.
import { parse as parseYaml } from 'yaml'
import { detectTextFormat } from './textFormats'
import { parseXml } from './xml'

/**
 * @typedef {object} TreeRow
 * @property {number} depth
 * @property {string} label       key, index, or element name
 * @property {string} path        dotted path, unique per row
 * @property {'same'|'added'|'removed'|'changed'} status
 * @property {boolean} container  opens an object/array rather than holding a value
 * @property {string} [left]      the value on the left, rendered
 * @property {string} [right]
 * @property {string} [leftType]  so a 1 → "1" retype reads as one
 * @property {string} [rightType]
 */

// The viewer draws a row per node with no virtualization, so an uncapped tree is
// a frozen window. Counts still cover the whole document — only drawing stops.
export const MAX_TREE_ROWS = 5000

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isBranch = (v) => Array.isArray(v) || isObject(v)
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v)
const render = (v) => (isBranch(v) ? '' : (JSON.stringify(v) ?? String(v)))
// Canonical form, used to tell array items apart. Keys are sorted, so two items
// that differ only in key order are the same item.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

// An element becomes an object: attributes as @name, repeated children as a
// list (element order is significant), text as #text. A leaf with nothing but
// text IS its text, which keeps <name>bro</name> from nesting pointlessly.
function xmlValue(node) {
  if (!node.attrs.length && !node.children.length) return node.text
  const out = {}
  for (const [k, v] of [...node.attrs].sort((a, b) => (a[0] < b[0] ? -1 : 1))) out[`@${k}`] = v
  const byName = new Map()
  for (const child of node.children) {
    if (!byName.has(child.name)) byName.set(child.name, [])
    byName.get(child.name).push(xmlValue(child))
  }
  for (const [name, list] of byName) out[name] = list.length === 1 ? list[0] : list
  if (node.text) out['#text'] = node.text
  return out
}

// An anchor bomb expands geometrically, so the alias budget is the guard that
// keeps a hostile file from taking the renderer down with it (CLAUDE.md #6).
const YAML_OPTIONS = { maxAliasCount: 100, prettyErrors: false }

const PARSERS = {
  json: (text) => ({ value: JSON.parse(text) }),
  yaml: (text) => ({ value: parseYaml(text, YAML_OPTIONS) ?? null }),
  xml: (text) => {
    const parsed = parseXml(text)
    if (parsed.error) throw new Error(parsed.error)
    return { value: { [parsed.root.name]: xmlValue(parsed.root) } }
  }
}

/**
 * @param {string} text
 * @param {'json'|'yaml'|'xml'} kind
 * @returns {{ value: unknown }|{ error: string }}
 */
export function parseStructured(text, kind) {
  try {
    return PARSERS[kind]?.(text) ?? { error: `Unsupported format: ${kind}` }
  } catch (e) {
    return { error: e.message }
  }
}

// YAML carries no bracket delimiters to sniff, so the extension proposes it and
// a successful parse confirms it. JSON and XML keep sniffing their own content,
// which is what lets an extensionless config still be recognised.
const YAML_EXT = /\.(ya?ml)$/i
function formatOf(side) {
  const text = side?.content ?? ''
  const sniffed = detectTextFormat(text)
  if (sniffed) return sniffed.valid ? sniffed.kind : null
  if (!YAML_EXT.test(side?.name ?? '')) return null
  return parseStructured(text, 'yaml').error ? null : 'yaml'
}

/**
 * The format BOTH sides are, or null when they differ, don't parse, or aren't
 * structured at all — the gate on offering a structural comparison.
 * @param {{ name?: string, content?: string }} left
 * @param {{ name?: string, content?: string }} right
 * @returns {'json'|'yaml'|'xml'|null}
 */
export function structuredKind(left, right) {
  const l = formatOf(left)
  return l && l === formatOf(right) ? l : null
}

// Longest common subsequence over canonical item forms, so an inserted array
// element does not re-report every item after it as changed.
function lcsTable(a, b) {
  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] =
        a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  return table
}

// Which side advances: 0 both (a match), -1 left only, 1 right only.
function step({ a, b, table }, i, j) {
  if (i >= a.length) return 1
  if (j >= b.length) return -1
  if (a[i] === b[j]) return 0
  return table[i + 1][j] >= table[i][j + 1] ? -1 : 1
}

function alignItems(left, right) {
  const a = left.map(canonical)
  const b = right.map(canonical)
  const lcs = { a, b, table: lcsTable(a, b) }
  const pairs = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    const dir = step(lcs, i, j)
    if (dir === 0) pairs.push([i++, j++])
    else if (dir < 0) pairs.push([i++, -1])
    else pairs.push([-1, j++])
  }
  return pairs
}

const MISSING = Symbol('missing')
const childPath = (path, label) => (path ? `${path}.${label}` : label)

// One row plus, for a branch, every row beneath it. `status` is forced on a
// whole subtree that was added or removed, so its children read the same way.
function walk(ctx, value, forced) {
  const { rows, label, path, depth } = ctx
  rows.push({
    depth,
    label,
    path,
    status: forced,
    container: isBranch(value),
    ...(isBranch(value)
      ? {}
      : {
          left: forced === 'added' ? undefined : render(value),
          right: forced === 'removed' ? undefined : render(value)
        })
  })
  if (!isBranch(value)) return
  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.keys(value)
        .sort()
        .map((k) => [k, value[k]])
  for (const [key, child] of entries) {
    walk({ rows, label: key, path: childPath(path, key), depth: depth + 1 }, child, forced)
  }
}

// One child slot: present on both sides, or added/removed whole.
function comparePair(next, left, right) {
  if (left === MISSING) walk(next, right, 'added')
  else if (right === MISSING) walk(next, left, 'removed')
  else compare(next, left, right)
}

const slotAt = ({ rows, path, depth }, label) => ({
  rows,
  label,
  path: childPath(path, label),
  depth: depth + 1
})
const itemAt = (list, index) => (index < 0 ? MISSING : list[index])
const fieldAt = (obj, key) => (key in obj ? obj[key] : MISSING)

// Labelled by position in the MERGED list, not by either side's index: an
// inserted item would otherwise carry the same index as the one it displaced,
// giving two rows the same path — which collided in the viewer's key and made an
// unchanged row inherit a changed one's visibility.
function compareArray(ctx, left, right) {
  let position = 0
  for (const [i, j] of alignItems(left, right)) {
    comparePair(slotAt(ctx, String(position++)), itemAt(left, i), itemAt(right, j))
  }
}

function compareObject(ctx, left, right) {
  for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
    comparePair(slotAt(ctx, key), fieldAt(left, key), fieldAt(right, key))
  }
}

const compareBranch = (ctx, left, right) =>
  Array.isArray(left) ? compareArray(ctx, left, right) : compareObject(ctx, left, right)

// Both sides present. A branch facing a scalar (or an array facing an object) is
// one change, not a merge — descending would pair unrelated things.
function compare(ctx, left, right) {
  const { rows, label, path, depth } = ctx
  const sameShape =
    isBranch(left) && isBranch(right) && Array.isArray(left) === Array.isArray(right)
  if (sameShape) {
    rows.push({ depth, label, path, status: 'same', container: true })
    compareBranch(ctx, left, right)
    return
  }
  const same = canonical(left) === canonical(right)
  rows.push({
    depth,
    label,
    path,
    status: same ? 'same' : 'changed',
    container: isBranch(left) || isBranch(right),
    left: render(left),
    right: render(right),
    leftType: typeOf(left),
    rightType: typeOf(right)
  })
}

/**
 * Compare two parsed documents.
 * @param {unknown} left
 * @param {unknown} right
 * @returns {{ rows: TreeRow[], hidden: number, stats: { added, removed, changed } }}
 */
export function diffStructures(left, right) {
  const rows = []
  compare({ rows, label: '', path: '', depth: -1 }, left, right)
  // The synthetic root is scaffolding — unless the whole document IS a scalar,
  // in which case that row is the only thing there is to report.
  const body = rows.filter((r) => r.path !== '' || !r.container)
  const stats = { added: 0, removed: 0, changed: 0 }
  for (const row of body) {
    if (row.status !== 'same') stats[row.status] += 1
  }
  return {
    rows: body.slice(0, MAX_TREE_ROWS),
    hidden: Math.max(0, body.length - MAX_TREE_ROWS),
    stats
  }
}
