// The tab context menu decides two things: which items it may offer, and which
// tabs each one takes. Both are pure, so the menu component holds no rules of
// its own and the awkward cases are testable without a right-click.
import { describe, expect, it } from 'vitest'
import {
  TAB_MENU_ACTIONS,
  clampMenu,
  nextEnabledIndex,
  tabMenuItems,
  tabsClosedBy
} from '../../../src/renderer/src/utils/tabMenu'

const strip = (n) => Array.from({ length: n }, (_, i) => ({ id: 't' + i }))
const labels = (items) => items.filter((i) => !i.sep).map((i) => i.action)
const enabled = (items) => items.filter((i) => !i.sep && i.enabled).map((i) => i.action)
const ids = (tabs, anchor, action) => tabsClosedBy(tabs, anchor, action).map((t) => t.id)

describe('tabMenuItems', () => {
  it('offers every action, in one order, whatever the anchor', () => {
    for (const anchor of ['t0', 't2', 't4']) {
      expect(labels(tabMenuItems(strip(5), anchor))).toEqual([
        'close',
        'close-others',
        'close-left',
        'close-right',
        'close-all'
      ])
    }
  })

  // Disabled, never hidden — an item that vanishes moves the ones under it, so
  // the same click does something different depending on where you are.
  it('keeps unavailable actions in place rather than dropping them', () => {
    const items = tabMenuItems(strip(1), 't0')
    expect(labels(items)).toHaveLength(TAB_MENU_ACTIONS.length)
    expect(enabled(items)).toEqual(['close', 'close-all'])
  })

  it('disables left on the first tab and right on the last', () => {
    expect(enabled(tabMenuItems(strip(3), 't0'))).not.toContain('close-left')
    expect(enabled(tabMenuItems(strip(3), 't0'))).toContain('close-right')
    expect(enabled(tabMenuItems(strip(3), 't2'))).toContain('close-left')
    expect(enabled(tabMenuItems(strip(3), 't2'))).not.toContain('close-right')
    expect(enabled(tabMenuItems(strip(3), 't1'))).toEqual(
      expect.arrayContaining(['close-left', 'close-right'])
    )
  })

  it('carries a separator before the all-or-nothing action', () => {
    const items = tabMenuItems(strip(3), 't1')
    expect(items[items.length - 2].sep).toBe(true)
    expect(items[items.length - 1].action).toBe('close-all')
  })

  it('is empty for a tab that is not in the strip', () => {
    expect(tabMenuItems(strip(3), 'nope')).toEqual([])
  })
})

describe('tabsClosedBy', () => {
  const five = strip(5)

  it('takes exactly the tabs each action names', () => {
    expect(ids(five, 't2', 'close')).toEqual(['t2'])
    expect(ids(five, 't2', 'close-others')).toEqual(['t0', 't1', 't3', 't4'])
    expect(ids(five, 't2', 'close-left')).toEqual(['t0', 't1'])
    expect(ids(five, 't2', 'close-right')).toEqual(['t3', 't4'])
    expect(ids(five, 't2', 'close-all')).toEqual(['t0', 't1', 't2', 't3', 't4'])
  })

  it('takes nothing when the action has nothing to take', () => {
    expect(ids(five, 't0', 'close-left')).toEqual([])
    expect(ids(five, 't4', 'close-right')).toEqual([])
    expect(ids(strip(1), 't0', 'close-others')).toEqual([])
  })

  it('takes nothing for an unknown action or a missing anchor', () => {
    expect(ids(five, 't2', 'close-everything-twice')).toEqual([])
    expect(ids(five, 'nope', 'close-all')).toEqual([])
  })

  // Every enabled action must actually do something, or the menu offers a
  // control that looks live and isn't.
  it('never enables an action that would close nothing', () => {
    const check = (tabs, anchorId) => {
      for (const item of tabMenuItems(tabs, anchorId)) {
        if (item.sep || !item.enabled) continue
        expect(tabsClosedBy(tabs, anchorId, item.action).length).toBeGreaterThan(0)
      }
    }
    for (const size of [1, 2, 5]) {
      const tabs = strip(size)
      for (const tab of tabs) check(tabs, tab.id)
    }
  })
})

describe('clampMenu', () => {
  const menu = { w: 240, h: 180 }
  const view = { w: 1000, h: 700 }

  it('opens at the pointer when there is room', () => {
    expect(clampMenu({ x: 100, y: 120, menu, view })).toEqual({ x: 100, y: 120 })
  })

  it('flips back from the right edge instead of hanging off it', () => {
    expect(clampMenu({ x: 900, y: 120, menu, view }).x).toBe(1000 - 240 - 4)
  })

  it('flips up from the bottom edge', () => {
    expect(clampMenu({ x: 100, y: 690, menu, view }).y).toBe(700 - 180 - 4)
  })

  it('never goes negative, even when the menu is taller than the window', () => {
    const tall = { w: 240, h: 900 }
    const at = clampMenu({ x: 2, y: 600, menu: tall, view })
    expect(at.x).toBeGreaterThanOrEqual(4)
    expect(at.y).toBeGreaterThanOrEqual(4)
  })
})

describe('nextEnabledIndex', () => {
  // Separators and disabled items are passed over: arrowing onto something you
  // cannot choose is a dead keypress.
  const items = [
    { action: 'close', enabled: true },
    { action: 'close-others', enabled: false },
    { action: 'close-left', enabled: true },
    { sep: true },
    { action: 'close-all', enabled: true }
  ]

  it('skips disabled items and separators going down', () => {
    expect(nextEnabledIndex(items, 0, 1)).toBe(2)
    expect(nextEnabledIndex(items, 2, 1)).toBe(4)
  })

  it('skips them going up too', () => {
    expect(nextEnabledIndex(items, 4, -1)).toBe(2)
    expect(nextEnabledIndex(items, 2, -1)).toBe(0)
  })

  it('wraps at both ends', () => {
    expect(nextEnabledIndex(items, 4, 1)).toBe(0)
    expect(nextEnabledIndex(items, 0, -1)).toBe(4)
  })

  it('finds the first choosable item from nowhere', () => {
    expect(nextEnabledIndex(items, -1, 1)).toBe(0)
  })

  it('returns -1 when nothing can be chosen', () => {
    expect(nextEnabledIndex([{ sep: true }, { action: 'x', enabled: false }], -1, 1)).toBe(-1)
  })
})
