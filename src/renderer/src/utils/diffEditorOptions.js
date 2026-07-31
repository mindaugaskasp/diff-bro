// Monaco diff-editor options, kept out of the component so the reasoning has
// room and the SFC stays inside its script budget.

/**
 * @param {{ dark: boolean, renderSideBySide: boolean, ignoreTrimWhitespace: boolean }} view
 * @returns {object} options for monaco.editor.createDiffEditor
 */
export const diffEditorOptions = ({ dark, renderSideBySide, ignoreTrimWhitespace }) => ({
  theme: dark ? 'vs-dark' : 'vs',
  automaticLayout: true,
  readOnly: true,
  originalEditable: false,
  renderSideBySide,
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
