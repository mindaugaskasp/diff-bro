// The caret as a character offset. A re-render replaces every node, so a
// (node, offset) pair points at something detached and the selection collapses
// to the start — the "caret jumps to the top when I type" failure.

const TEXT_NODE = 3

const selectionIn = (root) => root?.ownerDocument?.defaultView?.getSelection?.() ?? null

/**
 * @param {Element|null} root
 * @returns {number|null}  null when the caret is not inside `root`
 */
export function caretOffset(root) {
  const selection = selectionIn(root)
  if (!selection?.rangeCount) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer)) return null
  const upToCaret = range.cloneRange()
  upToCaret.selectNodeContents(root)
  upToCaret.setEnd(range.startContainer, range.startOffset)
  return upToCaret.toString().length
}

function textNodeAt(root, offset) {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let seen = 0
  let last = null
  let node = walker.nextNode()
  while (node) {
    const length = node.nodeValue?.length ?? 0
    if (seen + length >= offset) return { node, offset: offset - seen }
    seen += length
    last = node
    node = walker.nextNode()
  }
  // Past the end is routine: the re-rendered text is shorter than the source.
  return last ? { node: last, offset: last.nodeValue?.length ?? 0 } : null
}

/**
 * @param {Element|null} root
 * @param {number|null} offset  as returned by caretOffset
 */
export function restoreCaret(root, offset) {
  if (!root || offset == null) return
  const target = textNodeAt(root, offset)
  if (!target || target.node.nodeType !== TEXT_NODE) return
  const selection = selectionIn(root)
  if (!selection) return
  const range = root.ownerDocument.createRange()
  range.setStart(target.node, Math.min(target.offset, target.node.nodeValue?.length ?? 0))
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}
