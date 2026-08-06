// Monaco diff-editor options, kept out of the component so the reasoning has
// room and the SFC stays inside its script budget.

/**
 * No fontSize here on purpose: Monaco's own default is PLATFORM-SPECIFIC (12 on
 * macOS, 14 everywhere else), so a constant would silently shrink every diff on
 * Linux and Windows. DiffViewer reads the resolved size back once and zooms from
 * whatever this platform actually chose.
 *
 * @param {{ dark: boolean, renderSideBySide: boolean, ignoreTrimWhitespace: boolean }} view
 * @returns {object} options for monaco.editor.createDiffEditor
 */
export const diffEditorOptions = ({ dark, renderSideBySide, ignoreTrimWhitespace }) => ({
  theme: dark ? 'vs-dark' : 'vs',
  automaticLayout: true,
  readOnly: true,
  originalEditable: false,
  renderSideBySide,
  // Monaco goes INLINE on its own below `renderSideBySideInlineBreakpoint`
  // (900px), whatever renderSideBySide says. The window's minimum is 1120 and
  // the sidebar rests at 256, so the panes get ~864 — at the smallest size the
  // app opens at, Split view did nothing while its checkbox stayed ticked and
  // pressable. Greying it out on a drag would be worse: the reader asked for
  // two panes, so they get two panes.
  useInlineViewWhenSpaceIsLimited: false,
  ignoreTrimWhitespace,
  scrollBeyondLastLine: false,
  contextmenu: false,
  // Monaco's 14px default is a wide slab down the edge of each pane; the app's
  // own scrollbars are slimmer, so the diff was the odd one out.
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
  minimap: { enabled: false },
  // Monaco hangs an extra change-map strip off the MODIFIED side only, which
  // made the right scrollbar 44px wide against the left's 14px. Each pane keeps
  // its own decorations ruler, so the change marks survive — only the lopsided
  // duplicate goes. The snippet editor turns its ruler off for the same reason.
  renderOverviewRuler: false
})
