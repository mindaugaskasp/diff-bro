// What the tab context menu may offer, and what each choice takes with it.
// Pure, so the menu component renders a list it did not reason about and the
// bulk cases are testable without a right-click.

/** @typedef {'close'|'close-others'|'close-left'|'close-right'|'close-all'} TabMenuAction */
/** @typedef {import('../types').TabMenuItem} TabMenuItem */

/** In menu order. `close-all` is separated from the rest by tabMenuItems. */
export const TAB_MENU_ACTIONS = /** @type {TabMenuAction[]} */ ([
  'close',
  'close-others',
  'close-left',
  'close-right',
  'close-all'
])

export const TAB_MENU_LABELS = {
  close: 'Close',
  'close-others': 'Close Others',
  'close-left': 'Close to the Left',
  'close-right': 'Close to the Right',
  'close-all': 'Close All'
}

const SLICE = {
  close: (tabs, i) => tabs.slice(i, i + 1),
  'close-others': (tabs, i) => tabs.filter((_, j) => j !== i),
  'close-left': (tabs, i) => tabs.slice(0, i),
  'close-right': (tabs, i) => tabs.slice(i + 1),
  'close-all': (tabs) => tabs.slice()
}

/**
 * The tabs an action would close, in strip order. Empty for an unknown action
 * or an anchor that is no longer open.
 * @param {{ id: string }[]} tabs
 * @param {string} anchorId  the tab that was right-clicked
 * @param {TabMenuAction} action
 * @returns {{ id: string }[]}
 */
export function tabsClosedBy(tabs, anchorId, action) {
  const list = tabs ?? []
  const i = list.findIndex((t) => t.id === anchorId)
  if (i === -1) return []
  return SLICE[action]?.(list, i) ?? []
}

/**
 * The menu for one tab. Every action is always present — an item that vanished
 * would move the ones below it, changing what the same click does.
 * @param {{ id: string }[]} tabs
 * @param {string} anchorId
 * @returns {Array<{ action?: TabMenuAction, label?: string, enabled?: boolean, sep?: true }>}
 */
export function tabMenuItems(tabs, anchorId) {
  const list = tabs ?? []
  if (!list.some((t) => t.id === anchorId)) return []
  const items = []
  for (const action of TAB_MENU_ACTIONS) {
    if (action === 'close-all') items.push({ sep: true })
    items.push({
      action,
      label: TAB_MENU_LABELS[action],
      // Derived from the work, never declared: an enabled action that closes
      // nothing is a control that looks live and isn't.
      enabled: tabsClosedBy(list, anchorId, action).length > 0
    })
  }
  return items
}

// Kept off the window edge by this much, so the menu never sits flush against it.
const MENU_MARGIN = 4

/**
 * Where the menu opens: at the pointer, pulled back inside the window when it
 * would be cut off — on the last tab it otherwise hangs off the right edge.
 * @param {{ x: number, y: number, menu: {w:number,h:number}, view: {w:number,h:number} }} at
 * @returns {{ x: number, y: number }}
 */
export function clampMenu({ x, y, menu, view }) {
  const fit = (pos, size, extent) =>
    Math.max(MENU_MARGIN, Math.min(pos, extent - size - MENU_MARGIN))
  return { x: fit(x, menu.w, view.w), y: fit(y, menu.h, view.h) }
}

/**
 * The next item the arrow keys may land on, wrapping at both ends. Separators
 * and disabled items are passed over — arrowing onto something unchoosable is a
 * dead keypress.
 * @param {Array<{ enabled?: boolean, sep?: true }>} items
 * @param {number} from  current index, -1 for none
 * @param {1|-1} delta
 * @returns {number} -1 when nothing can be chosen
 */
export function nextEnabledIndex(items, from, delta) {
  const list = items ?? []
  if (!list.length) return -1
  let i = from
  for (let step = 0; step < list.length; step++) {
    i = (i + delta + list.length) % list.length
    if (!list[i].sep && list[i].enabled) return i
  }
  return -1
}
