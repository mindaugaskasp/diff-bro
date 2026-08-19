// The markup toolbar applied to the RENDERED view, which edits the DOM rather
// than the source: an offset into rendered text does not map onto one into
// markup (`**bold**` is 8 characters and shows 4).
//
// Rule 8: elements are BUILT, never parsed from a string.

const INLINE_TAG = { bold: 'STRONG', italic: 'EM', strike: 'S', code: 'CODE' }
const HEADING_LEVEL = { h1: 1, h2: 2, h3: 3 }
const LIST_KIND = { bullet: 'UL', numbered: 'OL', task: 'UL' }

const selectionIn = (root) => root?.ownerDocument?.defaultView?.getSelection?.() ?? null

function rangeIn(root) {
  const selection = selectionIn(root)
  if (!selection?.rangeCount) return null
  const range = selection.getRangeAt(0)
  return root.contains(range.startContainer) ? range : null
}

// Always a direct child of the root — that is what domToBlocks walks.
function blockIn(root) {
  const range = rangeIn(root)
  if (!range) return null
  let node = range.startContainer
  if (node.nodeType !== 1) node = node.parentElement
  while (node && node.parentElement !== root) node = node.parentElement
  return node
}

const listItemIn = (root) => {
  const range = rangeIn(root)
  if (!range) return null
  const node = range.startContainer
  const from = node.nodeType === 1 ? node : node.parentElement
  return from?.closest('li') ?? null
}

/**
 * Whether the caret sits in a list item — the question Tab has to answer before
 * taking the key away from the dialog's focus order.
 * @param {Element|null} root
 * @returns {boolean}
 */
export const isInListItem = (root) => !!root && !!listItemIn(root)

function wrapSelection(root, tag, decorate) {
  const range = rangeIn(root)
  if (!range || range.collapsed) return false
  const wrapper = root.ownerDocument.createElement(tag)
  wrapper.appendChild(range.extractContents())
  decorate?.(wrapper)
  range.insertNode(wrapper)
  return true
}

// Carries the old children over, so text survives a paragraph becoming a heading.
function retag(root, block, tag, className) {
  const next = root.ownerDocument.createElement(tag)
  next.className = className
  next.append(...block.childNodes)
  block.replaceWith(next)
  return next
}

function heading(root, id) {
  const block = blockIn(root)
  if (!block) return false
  const level = HEADING_LEVEL[id]
  // Reapplying the same level takes it back off, as linePrefix does.
  const already = block.nodeName === `H${level}`
  retag(root, block, already ? 'P' : `H${level}`, already ? 'ji-p' : 'ji-h')
  return true
}

function quote(root) {
  const block = blockIn(root)
  if (!block) return false
  const doc = root.ownerDocument
  const wrap = doc.createElement('blockquote')
  wrap.className = 'ji-quote'
  const inner = doc.createElement('div')
  inner.className = 'jira-rendered'
  block.replaceWith(wrap)
  inner.appendChild(block)
  wrap.appendChild(inner)
  return true
}

function list(root, id) {
  const block = blockIn(root)
  if (!block) return false
  const doc = root.ownerDocument
  const holder = doc.createElement(LIST_KIND[id])
  holder.className = id === 'task' ? 'ji-list ji-tasks' : 'ji-list'
  const item = doc.createElement('li')
  item.setAttribute('data-depth', '1')
  if (id === 'task') {
    item.className = 'ji-task'
    const box = doc.createElement('input')
    box.type = 'checkbox'
    item.appendChild(box)
  }
  item.append(...block.childNodes)
  holder.appendChild(item)
  block.replaceWith(holder)
  return true
}

function nest(root, deeper) {
  const item = listItemIn(root)
  if (!item) return false
  const depth = Math.max(1, Number(item.getAttribute('data-depth')) || 1)
  const next = deeper ? depth + 1 : depth - 1
  if (next < 1) return false
  item.setAttribute('data-depth', String(next))
  return true
}

function codeBlock(root) {
  const block = blockIn(root)
  if (!block) return false
  const pre = root.ownerDocument.createElement('pre')
  pre.className = 'ji-code'
  pre.textContent = block.textContent || ' '
  block.replaceWith(pre)
  return true
}

function table(root) {
  const block = blockIn(root)
  if (!block) return false
  const doc = root.ownerDocument
  const wrap = doc.createElement('div')
  wrap.className = 'ji-table-wrap'
  const el = doc.createElement('table')
  el.className = 'ji-table'
  const head = doc.createElement('thead')
  const headRow = doc.createElement('tr')
  const body = doc.createElement('tbody')
  const bodyRow = doc.createElement('tr')
  for (const label of ['Column', 'Column']) {
    const th = doc.createElement('th')
    th.textContent = label
    headRow.appendChild(th)
    bodyRow.appendChild(doc.createElement('td'))
  }
  head.appendChild(headRow)
  body.appendChild(bodyRow)
  el.append(head, body)
  wrap.appendChild(el)
  block.replaceWith(wrap)
  return true
}

const ACTIONS = {
  link: (root) =>
    wrapSelection(root, 'SPAN', (el) => {
      el.className = 'ji-link'
      el.setAttribute('title', '')
    }),
  quote,
  codeblock: codeBlock,
  table,
  indent: (root) => nest(root, true),
  outdent: (root) => nest(root, false)
}

/**
 * @param {Element|null} root  the contenteditable JiraRendered drew into
 * @param {string} id          a FormatToolbar action id
 * @returns {boolean}          whether anything changed
 */
export function applyDomFormat(root, id) {
  if (!root || !rangeIn(root)) return false
  if (INLINE_TAG[id]) {
    return wrapSelection(root, INLINE_TAG[id], (el) => {
      if (id === 'code') el.className = 'ji-mono'
    })
  }
  if (HEADING_LEVEL[id]) return heading(root, id)
  if (LIST_KIND[id]) return list(root, id)
  return ACTIONS[id]?.(root) ?? false
}
