import { describe, expect, it, vi } from 'vitest'
import { useQuickLookKeys } from '../../../src/renderer/src/composables/useQuickLookKeys'

// A plain {value} stands in for the Vue ref; count() is a getter over the list
// length. The KeyboardEvent is faked down to the two things the driver reads.
// Builds a press() that fakes the KeyboardEvent down to the two things the
// driver reads (key + preventDefault), shared by both harnesses.
function presser(onKeydown) {
  return (key, opts = {}) => {
    const preventDefault = vi.fn()
    onKeydown({ key, preventDefault, ...opts })
    return preventDefault
  }
}

function harness(n = 3, start = 0) {
  const selected = { value: start }
  const onChoose = vi.fn()
  const onDismiss = vi.fn()
  const onCopy = vi.fn()
  const onOpen = vi.fn()
  const onNew = vi.fn()
  const { onKeydown } = useQuickLookKeys({
    count: () => n,
    selected,
    onChoose,
    onDismiss,
    onCopy,
    onOpen,
    onNew
  })
  return { selected, onChoose, onDismiss, onCopy, onOpen, onNew, press: presser(onKeydown) }
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

  it('Shift+Cmd/Ctrl+C copies the whole row: there is no preview line to copy', () => {
    const collapsed = { selectionStart: 0, selectionEnd: 0 }
    const h = harness(3, 1)
    h.press('C', { metaKey: true, shiftKey: true, target: collapsed })
    expect(h.onCopy).toHaveBeenCalledWith(1)
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

// Esc leaves the launcher from anywhere; the ← key is only ever a caret move.
describe('useQuickLookKeys — leaving', () => {
  it('Escape dismisses, even with a section open', () => {
    const h = harness(3, 1)
    const prevented = h.press('Escape')
    expect(h.onDismiss).toHaveBeenCalledTimes(1)
    expect(prevented).toHaveBeenCalled()
  })

  it('ArrowLeft never navigates or dismisses, wherever the caret is', () => {
    const h = harness(3, 1)
    const atStart = { selectionStart: 0, selectionEnd: 0, value: 'auth' }
    const prevented = h.press('ArrowLeft', { target: atStart })
    expect(h.onDismiss).not.toHaveBeenCalled()
    expect(prevented).not.toHaveBeenCalled()
  })
})

describe('useQuickLookKeys — Enter and Cmd/Ctrl+Enter', () => {
  it('Enter chooses the selected row (a snippet opens the editor sheet)', () => {
    const h = harness(3, 2)
    h.press('Enter')
    expect(h.onChoose).toHaveBeenCalledWith(2)
    expect(h.onOpen).not.toHaveBeenCalled()
  })

  it('Cmd/Ctrl+Enter opens the selected row in the main window', () => {
    for (const mod of ['metaKey', 'ctrlKey']) {
      const h = harness(3, 1)
      const prevented = h.press('Enter', { [mod]: true })
      expect(h.onOpen).toHaveBeenCalledWith(1)
      expect(h.onChoose).not.toHaveBeenCalled()
      expect(prevented).toHaveBeenCalled()
    }
  })

  it('Cmd/Ctrl+Enter is a no-op on an empty list', () => {
    const h = harness(0)
    h.press('Enter', { metaKey: true })
    expect(h.onOpen).not.toHaveBeenCalled()
  })
})

// → still drills into a tools section or a tool, from the end of the query.
describe('useQuickLookKeys — ArrowRight', () => {
  function expandHarness(handles) {
    const onExpand = vi.fn(() => handles)
    const { onKeydown } = useQuickLookKeys({
      count: () => 3,
      selected: { value: 0 },
      onChoose: vi.fn(),
      onDismiss: vi.fn(),
      onExpand
    })
    return { onExpand, press: presser(onKeydown) }
  }
  const atEnd = { selectionStart: 4, selectionEnd: 4, value: 'json' }

  it('hands → to onExpand and prevents default when it handles it', () => {
    const h = expandHarness(true)
    const prevented = h.press('ArrowRight', { target: atEnd })
    expect(h.onExpand).toHaveBeenCalledTimes(1)
    expect(prevented).toHaveBeenCalled()
  })

  it('lets the caret move when onExpand declines', () => {
    const h = expandHarness(false)
    expect(h.press('ArrowRight', { target: atEnd })).not.toHaveBeenCalled()
  })

  it('does not fire mid-query', () => {
    const h = expandHarness(true)
    h.press('ArrowRight', { target: { selectionStart: 1, selectionEnd: 1, value: 'json' } })
    expect(h.onExpand).not.toHaveBeenCalled()
  })
})

describe('useQuickLookKeys — Cmd/Ctrl+N', () => {
  it('opens compose and swallows the key', () => {
    for (const mod of ['metaKey', 'ctrlKey']) {
      const h = harness()
      const prevented = h.press('n', { [mod]: true })
      expect(h.onNew).toHaveBeenCalledTimes(1)
      expect(prevented).toHaveBeenCalled()
    }
  })

  it('accepts a capital N, so Shift or caps lock still creates', () => {
    const h = harness()
    h.press('N', { metaKey: true })
    expect(h.onNew).toHaveBeenCalledTimes(1)
  })

  it('leaves an unmodified n to the search box', () => {
    const h = harness()
    const prevented = h.press('n')
    expect(h.onNew).not.toHaveBeenCalled()
    expect(prevented).not.toHaveBeenCalled()
  })

  it('does not fire on an empty list — creating needs no results', () => {
    const h = harness(0)
    h.press('n', { ctrlKey: true })
    expect(h.onNew).toHaveBeenCalledTimes(1)
  })
})

// AltGr reports as Ctrl+Alt on European keyboard layouts, so an unguarded chord
// swallows AltGr+N instead of letting it type into the search box.
describe('useQuickLookKeys — AltGr', () => {
  it('leaves Ctrl+Alt+N alone', () => {
    const h = harness()
    const prevented = h.press('n', { ctrlKey: true, altKey: true })
    expect(h.onNew).not.toHaveBeenCalled()
    expect(prevented).not.toHaveBeenCalled()
  })
})
