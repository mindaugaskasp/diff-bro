import { describe, expect, it } from 'vitest'
import { diffEditorOptions } from '../../../src/renderer/src/utils/diffEditorOptions'
import { MONACO_THEME } from '../../../src/renderer/src/composables/useMonacoTheme'

const view = (over = {}) => ({
  renderSideBySide: true,
  ignoreTrimWhitespace: false,
  ...over
})

describe('diffEditorOptions', () => {
  it('passes the view state straight through', () => {
    const opts = diffEditorOptions(view({ renderSideBySide: false, ignoreTrimWhitespace: true }))
    expect(opts.renderSideBySide).toBe(false)
    expect(opts.ignoreTrimWhitespace).toBe(true)
  })

  // It used to name a STOCK theme, dark or light, which is why all seven dark
  // themes drew the same #1e1e1e ground and the same olive/maroon bands. The
  // options only name the theme; useMonacoTheme defines it from the live
  // palette before the editor is built.
  it('names the app’s own theme rather than a stock one', () => {
    expect(diffEditorOptions(view()).theme).toBe(MONACO_THEME)
    expect(['vs', 'vs-dark']).not.toContain(diffEditorOptions(view()).theme)
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
