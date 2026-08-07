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
  const onCopyLine = vi.fn()
  const onNew = vi.fn()
  const { onKeydown } = useQuickLookKeys({
    count: () => n,
    selected,
    onChoose,
    onDismiss,
    onCopy,
    onCopyLine,
    onNew
  })
  return { selected, onChoose, onDismiss, onCopy, onCopyLine, onNew, press: presser(onKeydown) }
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

  it('Shift+Cmd/Ctrl+C copies the active preview line, not the whole row', () => {
    const collapsed = { selectionStart: 0, selectionEnd: 0 }
    const h = harness(3, 1)
    const pd = h.press('C', { metaKey: true, shiftKey: true, target: collapsed })
    expect(pd).toHaveBeenCalled()
    expect(h.onCopyLine).toHaveBeenCalledTimes(1)
    expect(h.onCopy).not.toHaveBeenCalled()

    const h2 = harness(3, 0)
    h2.press('c', { ctrlKey: true, shiftKey: true, target: collapsed })
    expect(h2.onCopyLine).toHaveBeenCalledTimes(1)
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

// A stand-in for the two focus zones. canEnter mirrors "the active row has a
// scrollable snippet preview"; movePreview is spied.
function previewHarness({ zoneStart = 'list', canEnter = true } = {}) {
  const selected = { value: 0 }
  const zone = { value: zoneStart }
  const movePreview = vi.fn()
  const onDismiss = vi.fn()
  const { onKeydown } = useQuickLookKeys({
    count: () => 3,
    selected,
    zone,
    canEnterPreview: () => canEnter,
    movePreview,
    onChoose: vi.fn(),
    onDismiss
  })
  const atEnd = { selectionStart: 4, selectionEnd: 4, value: 'auth' }
  return { selected, zone, movePreview, onDismiss, press: presser(onKeydown), atEnd }
}

describe('useQuickLookKeys — preview zone', () => {
  it('ArrowRight enters the preview from the end of the query when one exists', () => {
    const h = previewHarness()
    const pd = h.press('ArrowRight', { target: h.atEnd })
    expect(h.zone.value).toBe('preview')
    expect(pd).toHaveBeenCalled()
  })

  it('ArrowRight is ignored mid-query (the caret moves instead)', () => {
    const h = previewHarness()
    const pd = h.press('ArrowRight', {
      target: { selectionStart: 2, selectionEnd: 2, value: 'auth' }
    })
    expect(h.zone.value).toBe('list')
    expect(pd).not.toHaveBeenCalled()
  })

  it('ArrowRight is ignored when the row has no scrollable preview', () => {
    const h = previewHarness({ canEnter: false })
    h.press('ArrowRight', { target: h.atEnd })
    expect(h.zone.value).toBe('list')
  })

  it('in the preview, Up/Down step the active line and leave the list selection put', () => {
    const h = previewHarness({ zoneStart: 'preview' })
    h.press('ArrowDown')
    h.press('ArrowUp')
    expect(h.movePreview.mock.calls).toEqual([
      [1, false],
      [-1, false]
    ])
    expect(h.selected.value).toBe(0)
  })

  it('ArrowLeft returns from the preview to the list', () => {
    const h = previewHarness({ zoneStart: 'preview' })
    const pd = h.press('ArrowLeft')
    expect(h.zone.value).toBe('list')
    expect(pd).toHaveBeenCalled()
  })

  it('Escape backs out of the preview before it dismisses', () => {
    const h = previewHarness({ zoneStart: 'preview' })
    h.press('Escape')
    expect(h.zone.value).toBe('list')
    expect(h.onDismiss).not.toHaveBeenCalled()
    h.press('Escape')
    expect(h.onDismiss).toHaveBeenCalledTimes(1)
  })
})

describe('useQuickLookKeys — onExpand (→ on a non-preview row)', () => {
  function expandHarness(handled) {
    const onExpand = vi.fn(() => handled)
    const { onKeydown } = useQuickLookKeys({
      count: () => 3,
      selected: { value: 0 },
      canEnterPreview: () => false,
      onChoose: vi.fn(),
      onDismiss: vi.fn(),
      onExpand
    })
    const atEnd = { selectionStart: 4, selectionEnd: 4, value: 'base' }
    return { onExpand, press: presser(onKeydown), atEnd }
  }

  it('hands → to onExpand and prevents default when it handles it (a command)', () => {
    const h = expandHarness(true)
    const pd = h.press('ArrowRight', { target: h.atEnd })
    expect(h.onExpand).toHaveBeenCalled()
    expect(pd).toHaveBeenCalled()
  })

  it('lets the caret move when onExpand declines (e.g. a diff row)', () => {
    const h = expandHarness(false)
    const pd = h.press('ArrowRight', { target: h.atEnd })
    expect(h.onExpand).toHaveBeenCalled()
    expect(pd).not.toHaveBeenCalled()
  })

  it('does not fire → mid-query', () => {
    const h = expandHarness(true)
    h.press('ArrowRight', { target: { selectionStart: 1, selectionEnd: 1, value: 'base' } })
    expect(h.onExpand).not.toHaveBeenCalled()
  })
})

describe('useQuickLookKeys — onCollapse (← / Escape in the list)', () => {
  function collapseHarness(handled) {
    const onCollapse = vi.fn(() => handled)
    const onDismiss = vi.fn()
    const { onKeydown } = useQuickLookKeys({
      count: () => 3,
      selected: { value: 0 },
      onChoose: vi.fn(),
      onDismiss,
      onCollapse
    })
    return { onCollapse, onDismiss, press: presser(onKeydown) }
  }

  it('ArrowLeft in the list collapses an open section and prevents default', () => {
    const h = collapseHarness(true)
    const pd = h.press('ArrowLeft')
    expect(h.onCollapse).toHaveBeenCalled()
    expect(pd).toHaveBeenCalled()
  })

  // ← is exit navigation: with no preview to leave and no section to collapse,
  // the only level left to back out of is the launcher itself.
  it('ArrowLeft dismisses when there is nothing left to back out of', () => {
    const h = collapseHarness(false)
    const pd = h.press('ArrowLeft')
    expect(h.onDismiss).toHaveBeenCalledTimes(1)
    expect(pd).toHaveBeenCalled()
  })

  // …but the search box owns ← while the caret still has somewhere to go, or
  // editing a query would slam the launcher shut mid-word.
  it('ArrowLeft stays a caret move while text sits to its left', () => {
    const h = collapseHarness(false)
    const pd = h.press('ArrowLeft', {
      target: { selectionStart: 2, selectionEnd: 2, value: 'diff' }
    })
    expect(h.onDismiss).not.toHaveBeenCalled()
    expect(pd).not.toHaveBeenCalled()
  })

  it('ArrowLeft dismisses from the start of a non-empty query', () => {
    const h = collapseHarness(false)
    h.press('ArrowLeft', { target: { selectionStart: 0, selectionEnd: 0, value: 'diff' } })
    expect(h.onDismiss).toHaveBeenCalledTimes(1)
  })

  it('ArrowLeft with a modifier is left to the field (word/line jump)', () => {
    const h = collapseHarness(false)
    for (const mod of ['metaKey', 'ctrlKey', 'altKey']) {
      h.press('ArrowLeft', {
        [mod]: true,
        target: { selectionStart: 0, selectionEnd: 0, value: '' }
      })
    }
    expect(h.onDismiss).not.toHaveBeenCalled()
  })

  it('ArrowLeft collapses before it dismisses, one level at a time', () => {
    const h = collapseHarness(true)
    h.press('ArrowLeft')
    expect(h.onCollapse).toHaveBeenCalled()
    expect(h.onDismiss).not.toHaveBeenCalled()
  })

  it('Escape collapses the section before dismissing', () => {
    const h = collapseHarness(true)
    h.press('Escape')
    expect(h.onCollapse).toHaveBeenCalled()
    expect(h.onDismiss).not.toHaveBeenCalled()
  })

  it('Escape dismisses when there is nothing to collapse', () => {
    const h = collapseHarness(false)
    h.press('Escape')
    expect(h.onDismiss).toHaveBeenCalledTimes(1)
  })
})

// Shift+Arrow in the preview extends a line range, as an editor does. In the
// LIST there is one selection, so Shift must not change what an arrow means.
describe('useQuickLookKeys — Shift+Arrow', () => {
  it('passes the extend flag through in the preview zone', () => {
    const h = previewHarness({ zoneStart: 'preview' })
    h.press('ArrowDown', { shiftKey: true })
    h.press('ArrowUp', { shiftKey: true })
    expect(h.movePreview.mock.calls).toEqual([
      [1, true],
      [-1, true]
    ])
  })

  it('leaves list navigation alone', () => {
    const h = previewHarness({ zoneStart: 'list' })
    const before = h.selected.value
    h.press('ArrowDown', { shiftKey: true })
    expect(h.selected.value).toBe(before + 1)
    expect(h.movePreview).not.toHaveBeenCalled()
  })
})

// The launcher had no key for "create a snippet" at all — startCompose's only
// caller was the + button's @click, which Tab reaches at the cost of killing
// every other key (the driver hangs off the search box's @keydown).
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
