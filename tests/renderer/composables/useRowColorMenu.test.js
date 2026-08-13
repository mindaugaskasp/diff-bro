import { describe, expect, it, vi } from 'vitest'
import { useRowColorMenu } from '../../../src/renderer/src/composables/useRowColorMenu'
import { ROW_COLORS } from '../../../src/renderer/src/utils/rowColor'

const CLEAR = ROW_COLORS.length

const harness = (current = null) => {
  const picked = []
  const closed = []
  const menu = useRowColorMenu({
    current: () => current,
    onPick: (c) => picked.push(c),
    onClose: () => closed.push(true)
  })
  return { menu, picked, closed }
}

const press = (menu, key) => {
  const e = { key, preventDefault: vi.fn(), stopPropagation: vi.fn() }
  menu.onKeydown(e)
  return e
}

// The cursor starts on what the row already is, so opening the menu on a blue
// row and pressing ↵ changes nothing — a menu that opens on someone else's
// answer is a menu that recolours by accident.
describe('useRowColorMenu — where it opens', () => {
  it('starts on the applied colour', () => {
    expect(harness('blue').menu.cursor.value).toBe(ROW_COLORS.findIndex((c) => c.id === 'blue'))
  })

  it('starts on None when the row has no colour, or an unknown one', () => {
    expect(harness(null).menu.cursor.value).toBe(CLEAR)
    expect(harness('puce').menu.cursor.value).toBe(CLEAR)
  })
})

describe('useRowColorMenu — the keyboard', () => {
  it('steps with either axis, since one row of targets reads as both', () => {
    const { menu } = harness(ROW_COLORS[0].id)
    press(menu, 'ArrowRight')
    expect(menu.cursor.value).toBe(1)
    press(menu, 'ArrowDown')
    expect(menu.cursor.value).toBe(2)
    press(menu, 'ArrowLeft')
    expect(menu.cursor.value).toBe(1)
    press(menu, 'ArrowUp')
    expect(menu.cursor.value).toBe(0)
  })

  it('wraps at both ends, with None as the last stop', () => {
    const { menu } = harness(ROW_COLORS[0].id)
    press(menu, 'ArrowLeft')
    expect(menu.cursor.value).toBe(CLEAR)
    press(menu, 'ArrowRight')
    expect(menu.cursor.value).toBe(0)
  })

  it('Home and End jump to the first colour and to None', () => {
    const { menu } = harness('green')
    press(menu, 'End')
    expect(menu.cursor.value).toBe(CLEAR)
    press(menu, 'Home')
    expect(menu.cursor.value).toBe(0)
  })

  it('↵ and Space apply what the cursor is on', () => {
    const a = harness(null)
    press(a.menu, 'Home')
    press(a.menu, 'Enter')
    expect(a.picked).toEqual([ROW_COLORS[0].id])

    const b = harness('blue')
    press(b.menu, 'End')
    press(b.menu, ' ')
    expect(b.picked).toEqual([null])
  })

  it('Escape closes without applying', () => {
    const { menu, picked, closed } = harness('blue')
    press(menu, 'Escape')
    expect(closed).toHaveLength(1)
    expect(picked).toEqual([])
  })

  // The arrows would step the row list underneath and Escape would reach the
  // dialog behind the sidebar — one press, one effect.
  it('keeps the keys it handles to itself', () => {
    const { menu } = harness(null)
    const e = press(menu, 'ArrowRight')
    expect(e.preventDefault).toHaveBeenCalled()
    expect(e.stopPropagation).toHaveBeenCalled()
  })

  it('leaves every other key alone', () => {
    const { menu, picked } = harness(null)
    const e = press(menu, 'a')
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(e.stopPropagation).not.toHaveBeenCalled()
    expect(picked).toEqual([])
  })

  it('the pointer moves the same cursor the keys do', () => {
    const { menu } = harness(null)
    menu.point(2)
    expect(menu.cursor.value).toBe(2)
    press(menu, 'Enter')
  })
})
