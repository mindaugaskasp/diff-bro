import { describe, expect, it, vi } from 'vitest'
import { useQuickLookKeys } from '../../../src/renderer/src/composables/useQuickLookKeys'

// A plain {value} stands in for the Vue ref; count() is a getter over the list
// length. The KeyboardEvent is faked down to the two things the driver reads.
function harness(n = 3, start = 0) {
  const selected = { value: start }
  const onChoose = vi.fn()
  const onDismiss = vi.fn()
  const onCopy = vi.fn()
  const { onKeydown } = useQuickLookKeys({ count: () => n, selected, onChoose, onDismiss, onCopy })
  const press = (key, opts = {}) => {
    const preventDefault = vi.fn()
    onKeydown({ key, preventDefault, ...opts })
    return preventDefault
  }
  return { selected, onChoose, onDismiss, onCopy, press }
}

describe('useQuickLookKeys', () => {
  it('moves the selection down and clamps at the last row (no wrap)', () => {
    const h = harness(3, 0)
    h.press('ArrowDown')
    expect(h.selected.value).toBe(1)
    h.press('ArrowDown')
    h.press('ArrowDown') // already at 2, clamps
    expect(h.selected.value).toBe(2)
  })

  it('moves the selection up and clamps at the first row', () => {
    const h = harness(3, 2)
    h.press('ArrowUp')
    expect(h.selected.value).toBe(1)
    h.press('ArrowUp')
    h.press('ArrowUp') // already at 0, clamps
    expect(h.selected.value).toBe(0)
  })

  it('Enter chooses the selected index when there are results', () => {
    const h = harness(3, 1)
    h.press('Enter')
    expect(h.onChoose).toHaveBeenCalledWith(1)
  })

  it('Enter is a no-op when the list is empty', () => {
    const h = harness(0, 0)
    h.press('Enter')
    expect(h.onChoose).not.toHaveBeenCalled()
  })

  it('Escape dismisses', () => {
    const h = harness(3, 0)
    h.press('Escape')
    expect(h.onDismiss).toHaveBeenCalledTimes(1)
  })

  it('preventDefault is called for every handled key', () => {
    const h = harness(3, 0)
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) {
      expect(h.press(key)).toHaveBeenCalled()
    }
  })

  it('ignores keys it does not handle', () => {
    const h = harness(3, 0)
    const pd = h.press('a')
    expect(pd).not.toHaveBeenCalled()
    expect(h.onChoose).not.toHaveBeenCalled()
    expect(h.onDismiss).not.toHaveBeenCalled()
  })

  it('Cmd/Ctrl+C copies the selected row when nothing is selected in the input', () => {
    const collapsed = { selectionStart: 2, selectionEnd: 2 }
    const h = harness(3, 1)
    const pd = h.press('c', { metaKey: true, target: collapsed })
    expect(pd).toHaveBeenCalled()
    expect(h.onCopy).toHaveBeenCalledWith(1)

    const h2 = harness(3, 2)
    h2.press('c', { ctrlKey: true, target: collapsed })
    expect(h2.onCopy).toHaveBeenCalledWith(2)
  })

  it('lets a real input selection copy natively (does not hijack Cmd+C)', () => {
    const h = harness(3, 0)
    const pd = h.press('c', { metaKey: true, target: { selectionStart: 0, selectionEnd: 4 } })
    expect(pd).not.toHaveBeenCalled()
    expect(h.onCopy).not.toHaveBeenCalled()
  })

  it('does not copy a plain c (no modifier) or when the list is empty', () => {
    const h = harness(3, 0)
    h.press('c', { target: { selectionStart: 0, selectionEnd: 0 } })
    expect(h.onCopy).not.toHaveBeenCalled()
    const empty = harness(0, 0)
    empty.press('c', { metaKey: true, target: { selectionStart: 0, selectionEnd: 0 } })
    expect(empty.onCopy).not.toHaveBeenCalled()
  })
})
