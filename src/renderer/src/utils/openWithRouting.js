// Where the next externally-opened file goes: left, then right, then a new tab.
//
// Derived, never counted: a counter desyncs for good the moment a tab is closed
// or a file dropped in between two opens.

/**
 * @param {object} o
 * @param {{ openWith?: boolean }|null} o.active  the tab on screen
 * @param {boolean} o.hasLeft
 * @param {boolean} o.hasRight
 * @returns {{ newTab: boolean, side: 'left'|'right' }}
 */
export function openWithTarget({ active, hasLeft, hasRight }) {
  // Only a tab this flow opened continues the cycle: filling the right of a
  // comparison the reader set up by hand would overwrite their work.
  if (!active?.openWith) return { newTab: true, side: 'left' }
  if (!hasLeft) return { newTab: false, side: 'left' }
  if (!hasRight) return { newTab: false, side: 'right' }
  return { newTab: true, side: 'left' }
}
