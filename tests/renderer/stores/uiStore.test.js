import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUiStore } from '../../../src/renderer/src/stores/uiStore'

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
