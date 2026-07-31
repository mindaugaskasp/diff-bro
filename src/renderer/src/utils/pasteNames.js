// What each side of a pasted comparison is called. A pasted side has no
// filename, so it borrowed a placeholder — which made every paste comparison
// (and every tab holding one) read the same. A name given here travels with the
// snapshot, so it survives a save, a tab switch and a reopen.

// Long enough for "staging response body", short enough not to overrun a tab or
// a file slot.
export const MAX_SIDE_NAME = 60

export const DEFAULT_SIDE_NAME = { left: 'Left (pasted)', right: 'Right (pasted)' }

/**
 * The label to store for a pasted side: the user's, trimmed and capped, or the
 * placeholder when they haven't named it.
 * @param {'left'|'right'} side
 * @param {string} [name]
 * @returns {string}
 */
export function sideName(side, name) {
  const clean = String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SIDE_NAME)
  return clean || DEFAULT_SIDE_NAME[side] || DEFAULT_SIDE_NAME.left
}

/**
 * True when a label is one the app supplied rather than one the user chose —
 * the tab bar uses this to fall back to the pasted text's first line.
 * @param {string} [name]
 * @returns {boolean}
 */
export const isDefaultSideName = (name) => Object.values(DEFAULT_SIDE_NAME).includes(name)
