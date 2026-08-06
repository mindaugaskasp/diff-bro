import { describe, expect, it } from 'vitest'
import { diffEditorOptions } from '../../../src/renderer/src/utils/diffEditorOptions'

const view = (over = {}) => ({
  dark: false,
  renderSideBySide: true,
  ignoreTrimWhitespace: false,
  ...over
})

describe('diffEditorOptions', () => {
  it('passes the view state straight through', () => {
    const opts = diffEditorOptions(view({ renderSideBySide: false, ignoreTrimWhitespace: true }))
    expect(opts.renderSideBySide).toBe(false)
    expect(opts.ignoreTrimWhitespace).toBe(true)
    expect(opts.theme).toBe('vs')
    expect(diffEditorOptions(view({ dark: true })).theme).toBe('vs-dark')
  })

  // Monaco renders INLINE whenever the diff editor is narrower than
  // `renderSideBySideInlineBreakpoint` (900px), whatever `renderSideBySide` says
  // — `useInlineViewWhenSpaceIsLimited` defaults to true. The window's minimum is
  // 1120px and the sidebar rests at 256, which leaves the panes ~864: at the
  // smallest size the app allows itself to open, Split view did nothing at all
  // while its checkbox stayed ticked, enabled and pressable. A control that
  // cannot report its own defeat has to win instead — the reader asked for two
  // panes, so they get two panes, and turning it off is how they get one.
  it('honours split view at any width instead of silently going inline', () => {
    expect(diffEditorOptions(view()).useInlineViewWhenSpaceIsLimited).toBe(false)
  })

  // No fontSize: Monaco's default is platform-specific (12 on macOS, 14
  // elsewhere) and DiffViewer reads the resolved size back to zoom from.
  it('states no font size, so the platform default survives to be read back', () => {
    expect(diffEditorOptions(view())).not.toHaveProperty('fontSize')
  })
})
