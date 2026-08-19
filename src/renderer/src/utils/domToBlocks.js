// Rendered DOM → the block tree both parsers emit; one renderer, one reader.
//
// Rule 8: reads only, and anything outside the class whitelist degrades to its
// textContent — so an element that reached the DOM can never become markup.

const TEXT_NODE = 3
const ELEMENT_NODE = 1

const WRAPPERS = { STRONG: 'strong', EM: 'em', U: 'ins', S: 'del' }

const textOf = (node) => node.textContent ?? ''

function inlineNode(el) {
  const wrapper = WRAPPERS[el.nodeName]
  if (wrapper) return { type: wrapper, inlines: inlinesOf(el) }
  if (el.nodeName === 'CODE') return { type: 'code', value: textOf(el) }
  if (el.classList?.contains('ji-link')) {
    return { type: 'link', label: textOf(el), href: el.getAttribute('title') ?? '' }
  }
  return null
}

// The whitelist miss falls through to text — the rule-8 safety net.
function inlineOf(child) {
  if (child.nodeType === TEXT_NODE) {
    return child.nodeValue ? { type: 'text', value: child.nodeValue } : null
  }
  if (child.nodeType !== ELEMENT_NODE) return null
  if (child.nodeName === 'BR' || child.nodeName === 'INPUT') return null
  const node = inlineNode(child)
  if (node) return node
  return textOf(child) ? { type: 'text', value: textOf(child) } : null
}

const inlinesOf = (el) => [...(el.childNodes ?? [])].map(inlineOf).filter(Boolean)

// <br>s are breaks inside ONE block, so children are cut into runs.
function paragraphLines(el) {
  const lines = [[]]
  for (const child of el.childNodes ?? []) {
    if (child.nodeName === 'BR') {
      lines.push([])
      continue
    }
    const node = inlineOf(child)
    if (node) lines.at(-1).push(node)
  }
  return lines.filter((line, i) => line.length || i === 0)
}

const depthOf = (li) => Math.max(1, Number(li.getAttribute('data-depth')) || 1)

function listItem(li) {
  const box = li.querySelector?.(':scope > input[type=checkbox]')
  const item = { depth: depthOf(li), inlines: inlinesOf(li) }
  // The live property: the attribute is only the box's initial value.
  return box ? { ...item, task: true, checked: box.checked === true } : item
}

const alignOf = (cell) => cell.style.textAlign || null

function tableBlock(wrap) {
  const table = wrap.querySelector('table')
  const head = [...table.querySelectorAll('thead th')]
  const rows = [...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map(inlinesOf))
  // Alignment is per COLUMN, so it is read off whichever row actually exists.
  const columns = head.length ? head : [...table.querySelectorAll('tbody tr:first-child > *')]
  const align = columns.map(alignOf)
  return {
    type: 'table',
    align: align.some(Boolean) ? align : [],
    head: head.map(inlinesOf),
    rows
  }
}

function blockOf(el) {
  const heading = /^H([1-6])$/.exec(el.nodeName)
  if (heading) return { type: 'heading', level: +heading[1], inlines: inlinesOf(el) }
  if (el.nodeName === 'UL' || el.nodeName === 'OL') {
    return {
      type: 'list',
      ordered: el.nodeName === 'OL',
      items: [...el.children].map(listItem)
    }
  }
  if (el.nodeName === 'PRE') return { type: 'code', code: textOf(el) }
  if (el.nodeName === 'BLOCKQUOTE') {
    return { type: 'quote', children: domToBlocks(el.querySelector('.jira-rendered') ?? el) }
  }
  if (el.querySelector?.('table')) return tableBlock(el)
  return { type: 'paragraph', lines: paragraphLines(el) }
}

const isEmpty = (block) => block.type === 'paragraph' && !block.lines.some((line) => line.length)

/**
 * @param {Element|null} root  the element JiraRendered drew into
 * @returns {import('../types').JiraBlock[]}
 */
export function domToBlocks(root) {
  if (!root) return []
  return [...(root.children ?? [])].map(blockOf).filter((b) => !isEmpty(b))
}
