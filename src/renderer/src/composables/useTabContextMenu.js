// Open/close and keyboard state for the tab context menu. The rules it applies
// are pure (utils/tabMenu); this owns only the parts that need a window — where
// the menu fits, and what dismisses it.
import { computed, nextTick, ref } from 'vue'
import { clampMenu, nextEnabledIndex, tabMenuItems } from '../utils/tabMenu'

// Mirrors the menu's own CSS, so the first paint is already clamped rather than
// measured once it is visible.
const MENU_W = 232
const ROW_H = 26
const SEP_H = 11
const PAD_Y = 10

/**
 * @param {() => { id: string }[]} getTabs
 * @returns {object}
 */
export function useTabContextMenu(getTabs) {
  const anchorId = ref(null)
  const at = ref({ x: 0, y: 0 })
  const cursor = ref(-1)

  const items = computed(() => (anchorId.value ? tabMenuItems(getTabs(), anchorId.value) : []))
  const open = computed(() => items.value.length > 0)

  const heightOf = (list) => PAD_Y + list.reduce((h, item) => h + (item.sep ? SEP_H : ROW_H), 0)

  /**
   * @param {string} id  the tab the menu belongs to
   * @param {{ x: number, y: number }} point  viewport coordinates
   * @param {boolean} [fromKeyboard]  pre-select the first item
   */
  function show(id, point, fromKeyboard = false) {
    const list = tabMenuItems(getTabs(), id)
    if (!list.length) return
    anchorId.value = id
    at.value = clampMenu({
      x: point.x,
      y: point.y,
      menu: { w: MENU_W, h: heightOf(list) },
      view: { w: window.innerWidth, h: window.innerHeight }
    })
    cursor.value = fromKeyboard ? nextEnabledIndex(list, -1, 1) : -1
  }

  function close() {
    anchorId.value = null
    cursor.value = -1
  }

  function move(delta) {
    cursor.value = nextEnabledIndex(items.value, cursor.value, delta)
  }

  const NAV = {
    Escape: () => close(),
    ArrowDown: () => move(1),
    ArrowUp: () => move(-1),
    Home: () => (cursor.value = nextEnabledIndex(items.value, -1, 1)),
    End: () => (cursor.value = nextEnabledIndex(items.value, 0, -1))
  }

  /**
   * @param {(anchorId: string, action: string) => void} run
   * @returns {(e: KeyboardEvent) => void}
   */
  const keyHandler = (run) => (e) => {
    if (!open.value) return
    const nav = NAV[e.key]
    if (nav) {
      e.preventDefault()
      nav()
      return
    }
    if (e.key !== 'Enter' && e.key !== ' ') return
    const item = items.value[cursor.value]
    if (!item?.enabled) return
    e.preventDefault()
    const id = anchorId.value
    close()
    // The menu is gone before the action runs, so a close that re-renders the
    // strip cannot tear down the element handling this keypress mid-flight.
    nextTick(() => run(id, item.action))
  }

  return { anchorId, at, cursor, items, open, show, close, move, keyHandler }
}
