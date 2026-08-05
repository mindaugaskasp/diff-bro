import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSectionReorder } from '../../../src/renderer/src/composables/useSectionReorder'
import { useSettingsStore } from '../../../src/renderer/src/stores/settingsStore'
import { SECTIONS } from '../../../src/renderer/src/utils/settingsDefaults'

// The composable hit-tests the header under the cursor rather than reading
// e.target, because pointer capture retargets every move to the source. jsdom
// has no layout, so the geometry is declared here: y is the section's row.
const ROWS = { saved: 10, external: 20, snippets: 30, tools: 40 }

const headerAt = (y) => {
  const id = Object.keys(ROWS).find((key) => ROWS[key] === y)
  return id ? { closest: () => ({ dataset: { section: id } }) } : null
}

const pointer = (y, { x = 0, button = 0, pointerId = 1, target = null } = {}) => ({
  button,
  pointerId,
  clientX: x,
  clientY: y,
  target: target ?? { closest: () => null },
  currentTarget: { setPointerCapture: vi.fn() }
})

// A press that landed on one of the header's own controls.
const onControl = (y) =>
  pointer(y, { target: { closest: (sel) => (sel.includes('button') ? {} : null) } })

// Press on one section, travel to another, release.
const drag = (r, fromId, toId) => {
  r.onPointerDown(fromId, pointer(ROWS[fromId]))
  r.onPointerMove(pointer(ROWS[toId]))
  r.onPointerUp(pointer(ROWS[toId]))
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  document.elementFromPoint = vi.fn((_x, y) => headerAt(y))
})

afterEach(() => {
  delete document.elementFromPoint
})

describe('useSectionReorder', () => {
  it('a full drag from one header to another reorders the sections', () => {
    const r = useSectionReorder()
    drag(r, 'snippets', 'saved') // dropped before "saved"
    expect(useSettingsStore().sectionOrder.slice(0, 3)).toEqual(['snippets', 'saved', 'external'])
  })

  // Capture retargets pointerup to the header. Doing it on the PRESS means a
  // button inside the header never gets its pointerup, and Chromium then fires
  // no click at all — which took out "New snippet" and every row action.
  it('does not capture the pointer on a press, only once a drag begins', () => {
    const r = useSectionReorder()
    const down = pointer(ROWS.snippets)
    r.onPointerDown('snippets', down)
    expect(down.currentTarget.setPointerCapture).not.toHaveBeenCalled()

    const move = pointer(ROWS.saved)
    r.onPointerMove(move)
    expect(move.currentTarget.setPointerCapture).toHaveBeenCalledWith(move.pointerId)
  })

  it('ignores a press that begins on one of the header’s own controls', () => {
    const r = useSectionReorder()
    r.onPointerDown('snippets', onControl(ROWS.snippets))
    r.onPointerMove(pointer(ROWS.saved))
    r.onPointerUp(pointer(ROWS.saved))
    expect(useSettingsStore().sectionOrder).toEqual(SECTIONS)
    // And the control's own click is left entirely alone.
    expect(r.consumeClickSuppression()).toBe(false)
  })

  it('marks only the hovered header as the drop target, following the cursor', () => {
    const r = useSectionReorder()
    expect(r.isDropTarget('saved')).toBe(false) // nothing pressed yet
    r.onPointerDown('saved', pointer(ROWS.saved))
    // A press alone is not a drag: nothing is marked until the cursor travels.
    expect(r.isDragging('saved')).toBe(false)
    expect(r.isDropTarget('external')).toBe(false)

    r.onPointerMove(pointer(ROWS.external))
    expect(r.isDragging('saved')).toBe(true)
    expect(r.isDropTarget('external')).toBe(true)
    expect(r.isDropTarget('snippets')).toBe(false)
    expect(r.isDropTarget('saved')).toBe(false) // never its own target

    r.onPointerMove(pointer(ROWS.snippets))
    expect(r.isDropTarget('snippets')).toBe(true)
    expect(r.isDropTarget('external')).toBe(false)

    r.onPointerUp(pointer(ROWS.snippets))
    expect(r.isDropTarget('snippets')).toBe(false)
    expect(r.isDragging('saved')).toBe(false)
  })

  it('a completed drag marks the moved section as settling, and only it', () => {
    const r = useSectionReorder()
    drag(r, 'snippets', 'saved')
    expect(r.isSettling('snippets')).toBe(true)
    expect(r.isSettling('saved')).toBe(false)
    expect(r.isSettling('external')).toBe(false)
  })

  it('a press that never travels is a click, not a drag', () => {
    const r = useSectionReorder()
    r.onPointerDown('snippets', pointer(ROWS.snippets))
    // Inside the threshold — a hand resting on a trackpad moves a pixel or two.
    r.onPointerMove(pointer(ROWS.snippets, { x: 2 }))
    expect(r.isDragging('snippets')).toBe(false)
    r.onPointerUp(pointer(ROWS.snippets, { x: 2 }))

    expect(useSettingsStore().sectionOrder).toEqual(SECTIONS)
    // The header is free to collapse: nothing suppressed its click.
    expect(r.consumeClickSuppression()).toBe(false)
  })

  it('a drag swallows the click it ends with, so the section does not collapse', () => {
    const r = useSectionReorder()
    drag(r, 'snippets', 'saved')
    expect(r.consumeClickSuppression()).toBe(true)
    // Consumed once only — the NEXT click is a real one.
    expect(r.consumeClickSuppression()).toBe(false)
  })

  it('a drop onto the section itself neither reorders nor pulses', () => {
    const r = useSectionReorder()
    drag(r, 'saved', 'saved')
    expect(useSettingsStore().sectionOrder).toEqual(SECTIONS)
    expect(r.isSettling('saved')).toBe(false)
  })

  it('a drag released off every header leaves the order alone', () => {
    const r = useSectionReorder()
    r.onPointerDown('snippets', pointer(ROWS.snippets))
    r.onPointerMove(pointer(ROWS.saved))
    r.onPointerUp(pointer(999)) // released over empty sidebar
    expect(useSettingsStore().sectionOrder).toEqual(SECTIONS)
  })

  it('a cancelled drag leaves the order alone', () => {
    const r = useSectionReorder()
    r.onPointerDown('snippets', pointer(ROWS.snippets))
    r.onPointerMove(pointer(ROWS.saved))
    r.onCancel()
    expect(r.isDragging('snippets')).toBe(false)
    expect(useSettingsStore().sectionOrder).toEqual(SECTIONS)
  })

  it('does nothing while the order is locked', () => {
    useSettingsStore().toggleSectionsLock()
    const r = useSectionReorder()
    drag(r, 'snippets', 'saved') // refused: no gesture begins
    expect(r.isDropTarget('saved')).toBe(false)
    expect(useSettingsStore().sectionOrder).toEqual(SECTIONS)
  })

  // A press the window never sees the end of (focus lost mid-gesture) used to
  // stay armed, so the next unrelated move finished a drag nobody started.
  it('an abandoned press does not arm the next gesture', () => {
    const r = useSectionReorder()
    r.onPointerDown('snippets', pointer(ROWS.snippets)) // …and no up ever arrives
    r.onPointerDown('saved', onControl(ROWS.saved)) // a press on a control: refused
    r.onPointerMove(pointer(ROWS.tools))
    r.onPointerUp(pointer(ROWS.tools))
    expect(useSettingsStore().sectionOrder).toEqual(SECTIONS)
  })

  it('ignores a non-primary button, so a right-click never starts a drag', () => {
    const r = useSectionReorder()
    r.onPointerDown('snippets', pointer(ROWS.snippets, { button: 2 }))
    r.onPointerMove(pointer(ROWS.saved))
    r.onPointerUp(pointer(ROWS.saved))
    expect(useSettingsStore().sectionOrder).toEqual(SECTIONS)
  })
})
