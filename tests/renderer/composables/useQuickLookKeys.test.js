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
  const { onKeydown } = useQuickLookKeys({ count: () => n, selected, onChoose, onDismiss, onCopy })
  return { selected, onChoose, onDismiss, onCopy, press: presser(onKeydown) }
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

// A stand-in for the two focus zones. canEnter mirrors "the active row has a
// scrollable snippet preview"; scrollPreview is spied.
function previewHarness({ zoneStart = 'list', canEnter = true } = {}) {
  const selected = { value: 0 }
  const zone = { value: zoneStart }
  const scrollPreview = vi.fn()
  const onDismiss = vi.fn()
  const { onKeydown } = useQuickLookKeys({
    count: () => 3,
    selected,
    zone,
    canEnterPreview: () => canEnter,
    scrollPreview,
    onChoose: vi.fn(),
    onDismiss
  })
  const atEnd = { selectionStart: 4, selectionEnd: 4, value: 'auth' }
  return { selected, zone, scrollPreview, onDismiss, press: presser(onKeydown), atEnd }
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

  it('in the preview, Up/Down scroll the body and leave the selection put', () => {
    const h = previewHarness({ zoneStart: 'preview' })
    h.press('ArrowDown')
    h.press('ArrowUp')
    expect(h.scrollPreview.mock.calls).toEqual([[1], [-1]])
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
