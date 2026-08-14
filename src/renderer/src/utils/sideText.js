// The text of each compared side, and whether a side has any to give.
//
// Two callers with one answer between them: the slot decides whether to offer a
// copy control at all, and the copy action reads what to put on the clipboard.
// Splitting that decision would let a button appear over a side that copies
// nothing.

/**
 * The two compared sides as { name, content }, whether in files or paste mode.
 * @param {object} store the diff store
 * @returns {[{ name: string, content?: string }, { name: string, content?: string }]}
 */
export function comparedSides(store) {
  if (store.mode === 'paste') {
    return [
      store.pasteLeftFile ?? { name: 'Left', content: store.pasteLeft },
      store.pasteRightFile ?? { name: 'Right', content: store.pasteRight }
    ]
  }
  return [
    store.left ?? { name: 'Left', content: '' },
    store.right ?? { name: 'Right', content: '' }
  ]
}

/**
 * Whether this side holds text a reader could copy. A spreadsheet carries
 * `sheets` and a streamed file carries only a path, so neither has `content` —
 * both answer false, which is what keeps the copy control off them.
 * @param {{ content?: string }|null} file
 */
export const isCopyableSide = (file) => typeof file?.content === 'string' && file.content.length > 0

/**
 * The side to copy, or null when there is nothing to put on the clipboard.
 * @param {object} store the diff store
 * @param {'left'|'right'} side
 * @returns {{ name: string, content: string }|null}
 */
export function copyableSide(store, side) {
  const [left, right] = comparedSides(store)
  const file = side === 'right' ? right : left
  return isCopyableSide(file) ? { name: file.name, content: file.content } : null
}
