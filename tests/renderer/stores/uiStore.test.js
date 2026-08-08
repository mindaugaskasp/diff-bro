import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { MOVED_ROW_MS, useUiStore } from '../../../src/renderer/src/stores/uiStore'

beforeEach(() => setActivePinia(createPinia()))

// All three actions were uncovered. openToolsPalette narrows paletteScope, and
// only commands.js widens it again — a pairing nothing asserted, so a palette
// permanently stuck in tools-only scope after one press would have shipped.
describe('uiStore', () => {
  it('opens the Mermaid viewer with the diagram it was given', () => {
    const ui = useUiStore()
    expect(ui.mermaidView).toBeNull()
    ui.openMermaid('Flow', 'graph TD; a-->b')
    expect(ui.mermaidView).toEqual({ name: 'Flow', code: 'graph TD; a-->b', theme: '' })
  })

  // The per-viewing ground carried over from the editor preview's Expand.
  it('carries an optional ground through to the viewer', () => {
    const ui = useUiStore()
    ui.openMermaid('Flow', 'graph TD;', 'dark')
    expect(ui.mermaidView.theme).toBe('dark')
  })

  it('closing clears the viewer rather than leaving stale code behind', () => {
    const ui = useUiStore()
    ui.openMermaid('Flow', 'graph TD;')
    ui.closeMermaid()
    expect(ui.mermaidView).toBeNull()
  })

  it('opens the palette narrowed to tools', () => {
    const ui = useUiStore()
    expect(ui.paletteScope).toBe('all')
    ui.openToolsPalette()
    expect(ui.showCommandPalette).toBe(true)
    expect(ui.paletteScope).toBe('tools')
  })
})

// A row that just moved is somewhere new in a list the reader was already
// looking at — without a mark, the only feedback is that everything shifted.
// Its own key, not the new-row one: "created" and "moved" carry different
// badges, and a move must not claim a row is new.
describe('uiStore — the row a reorder just moved', () => {
  it('marks it, and clears itself after the wash', () => {
    vi.useFakeTimers()
    const ui = useUiStore()
    ui.markMovedRow('row-1')
    expect(ui.lastMovedRowId).toBe('row-1')
    vi.advanceTimersByTime(MOVED_ROW_MS)
    expect(ui.lastMovedRowId).toBeNull()
    vi.useRealTimers()
  })

  it('a second move retimes the wash rather than stacking two', () => {
    vi.useFakeTimers()
    const ui = useUiStore()
    ui.markMovedRow('row-1')
    vi.advanceTimersByTime(MOVED_ROW_MS - 100)
    ui.markMovedRow('row-2')
    vi.advanceTimersByTime(200)
    // The first row's timer must not clear the second row's mark.
    expect(ui.lastMovedRowId).toBe('row-2')
    vi.advanceTimersByTime(MOVED_ROW_MS)
    expect(ui.lastMovedRowId).toBeNull()
    vi.useRealTimers()
  })

  it('does not claim a moved row is a new one', () => {
    const ui = useUiStore()
    ui.markMovedRow('row-1')
    expect(ui.lastCreatedRowId).toBeNull()
  })
})
