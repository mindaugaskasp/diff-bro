// DOMParser in 'text/xml' executes nothing and resolves no external entities,
// and the document is never inserted into the page — only read into plain
// objects the template renders as text (docs/standards.md #7).
import { formatXml, validateXml } from './textFormats'

/**
 * @typedef {object} XmlNode
 * @property {string} name      element name
 * @property {[string, string][]} attrs  attributes in source order
 * @property {XmlNode[]} children        element children
 * @property {string} text               direct text content, trimmed ('' when none)
 */

function toNode(el) {
  const children = []
  let text = ''
  for (const child of el.childNodes) {
    if (child.nodeType === 1) children.push(toNode(child))
    else if (child.nodeType === 3 || child.nodeType === 4) text += child.nodeValue
  }
  return {
    name: el.nodeName,
    attrs: Array.from(el.attributes ?? []).map((a) => [a.name, a.value]),
    children,
    text: text.trim()
  }
}

/**
 * @param {string} text
 * @returns {{ root: XmlNode } | { error: string, line?: number, column?: number }}
 */
export function parseXml(text) {
  if (!text.trim()) return { error: 'Nothing to parse.' }
  // Ours first: DOMParser's parsererror carries no portable line/column.
  const status = validateXml(text)
  if (!status.valid) return { error: status.error, line: status.line, column: status.column }
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  if (doc.getElementsByTagName('parsererror').length || !doc.documentElement) {
    return { error: 'Could not parse this XML.' }
  }
  return { root: toNode(doc.documentElement) }
}

/**
 * @param {string} text
 * @param {'pretty'|'minify'} [mode]
 * @returns {string}
 */
export function stringifyXml(text, mode = 'pretty') {
  if (!text.trim()) return ''
  if (mode === 'minify') return text.replace(/>\s+</g, '><').trim()
  return formatXml(text)
}

// Supported: /a/b, //b, [n] (1-based, as XPath counts), @attr, and *.
// Sticky, so a gap between steps is an unsupported path, not a skipped one.
const STEP = /(\/\/|\/)(@?[A-Za-z_*][\w:.-]*|\*)(\[(\d+)\])?/y

function tokenize(path) {
  const trimmed = path.trim()
  if (!trimmed) return []
  const full = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  STEP.lastIndex = 0
  const steps = []
  while (STEP.lastIndex < full.length) {
    const m = STEP.exec(full)
    if (!m) return null
    steps.push({ deep: m[1] === '//', name: m[2], index: m[4] ? Number(m[4]) : null })
  }
  return steps
}

function descendants(node, out) {
  for (const child of node.children) {
    out.push(child)
    descendants(child, out)
  }
}

function candidates(nodes, deep) {
  const out = []
  for (const node of nodes) {
    if (deep) descendants(node, out)
    else out.push(...node.children)
  }
  return out
}

function stepNodes(step, nodes) {
  if (step.name.startsWith('@')) {
    const want = step.name.slice(1)
    return nodes.flatMap((n) =>
      n.attrs.filter(([k]) => want === '*' || k === want).map(([, v]) => v)
    )
  }
  const pool = candidates(nodes, step.deep).filter((n) => step.name === '*' || n.name === step.name)
  return step.index ? pool.slice(step.index - 1, step.index) : pool
}

/**
 * @param {XmlNode} root
 * @param {string} path
 * @returns {{ matches: (XmlNode|string)[] } | { error: string }}
 */
export function xpath(root, path) {
  const steps = tokenize(path)
  if (steps === null) return { error: 'Unsupported path.' }
  if (!steps.length) return { matches: [root] }

  // /name selects the root itself; //name searches from it.
  let current = [root]
  const [first, ...rest] = steps
  if (!first.deep) {
    if (first.name !== '*' && first.name !== root.name && !first.name.startsWith('@')) {
      return { matches: [] }
    }
    current = first.name.startsWith('@') ? stepNodes(first, current) : [root]
  } else {
    current = stepNodes(first, current)
  }
  for (const step of rest) {
    if (current.some((n) => typeof n === 'string')) return { matches: [] }
    current = stepNodes(step, current)
  }
  return { matches: current }
}
