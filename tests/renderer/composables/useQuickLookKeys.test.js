import { describe, expect, it, vi } from 'vitest'
import {
  isStepBack,
  useQuickLookKeys
} from '../../../src/renderer/src/composables/useQuickLookKeys'

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

  it('ArrowLeft never dismisses', () => {
    const h = harness(3, 1)
    h.press('ArrowLeft', { target: { selectionStart: 0, selectionEnd: 0, value: 'auth' } })
    expect(h.onDismiss).not.toHaveBeenCalled()
  })
})

describe('isStepBack', () => {
  const left = (target, extra = {}) => ({ key: 'ArrowLeft', target, ...extra })
  const field = (start, end = start, value = 'auth') => ({
    selectionStart: start,
    selectionEnd: end,
    value
  })
  const element = (tag, type) => {
    const el = document.createElement(tag)
    if (type) el.type = type
    return el
  }

  it('steps back from a caret at the start, or an empty field', () => {
    expect(isStepBack(left(field(0)))).toBe(true)
    expect(isStepBack(left(field(0, 0, '')))).toBe(true)
  })

  it('leaves a caret with room to move, or a selection to collapse', () => {
    expect(isStepBack(left(field(2)))).toBe(false)
    expect(isStepBack(left(field(0, 4)))).toBe(false)
  })

  it('stops at the start when the key is held', () => {
    expect(isStepBack(left(field(0), { repeat: true }))).toBe(false)
  })

  it('leaves text mid-composition to the input method', () => {
    expect(isStepBack(left(field(0), { isComposing: true }))).toBe(false)
  })

  it.each(['shiftKey', 'altKey', 'metaKey', 'ctrlKey'])('leaves %s chords alone', (modifier) => {
    expect(isStepBack(left(field(0), { [modifier]: true }))).toBe(false)
  })

  it('steps back from a control that has no use for the key', () => {
    expect(isStepBack(left(element('button')))).toBe(true)
    expect(isStepBack(left(element('input', 'checkbox')))).toBe(true)
    expect(isStepBack(left(element('div')))).toBe(true)
  })

  it('leaves a control that moves with ← without reporting a caret', () => {
    expect(isStepBack(left(element('select')))).toBe(false)
    expect(isStepBack(left(element('input', 'datetime-local')))).toBe(false)
  })

  it('answers no for any other key', () => {
    expect(isStepBack({ key: 'ArrowRight', target: field(0) })).toBe(false)
  })
})

describe('useQuickLookKeys — ArrowLeft', () => {
  function collapseHarness(handles) {
    const onCollapse = vi.fn(() => handles)
    const { onKeydown } = useQuickLookKeys({
      count: () => 3,
      selected: { value: 0 },
      onChoose: vi.fn(),
      onDismiss: vi.fn(),
      onCollapse
    })
    return { onCollapse, press: presser(onKeydown) }
  }
  const atStart = { selectionStart: 0, selectionEnd: 0, value: '' }

  it('steps back a level from the start of the query', () => {
    const h = collapseHarness(true)
    expect(h.press('ArrowLeft', { target: atStart })).toHaveBeenCalled()
    expect(h.onCollapse).toHaveBeenCalledTimes(1)
  })

  it('stays a cursor key when there is no level to step back to', () => {
    const h = collapseHarness(false)
    expect(h.press('ArrowLeft', { target: atStart })).not.toHaveBeenCalled()
  })

  it('stays a cursor key mid-query', () => {
    const h = collapseHarness(true)
    const midQuery = { selectionStart: 2, selectionEnd: 2, value: 'auth' }
    expect(h.press('ArrowLeft', { target: midQuery })).not.toHaveBeenCalled()
    expect(h.onCollapse).not.toHaveBeenCalled()
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
