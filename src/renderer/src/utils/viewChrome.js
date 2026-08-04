// Which chrome a comparison supports. Facts about the VIEW, kept out of the
// components so they are testable and so the toolbar cannot answer one of them
// differently from the viewer that actually reads the state.

/**
 * Whether a status band is drawn under the comparison. The floating shortcut bar
 * is anchored to the same column, so it has to clear the band or it covers the
 * change counts.
 * @param {object} store the diff store
 * @returns {boolean}
 */
export const hasStatusBand = (store) =>
  !!store?.ready && (store.comparableKind !== 'text' || (!!store.stats && !store.identical))

/**
 * Split view is NOT a Monaco-only option: the diagram viewer reads the same flag
 * to choose between two side-by-side renders and one stitched layout
 * (DiagramDiffViewer.vue). It means nothing to a grid, a structure tree or a
 * streamed comparison, and a control that cannot act reads as broken.
 * @param {object} store
 * @returns {boolean}
 */
export const showsSplitView = (store) =>
  !!store?.ready && (store.comparableKind === 'text' || store.comparableKind === 'diagram')

/**
 * Ignore-whitespace really is Monaco's alone (diffEditorOptions.js) — no other
 * viewer reads it.
 * @param {object} store
 * @returns {boolean}
 */
export const showsWhitespaceToggle = (store) => !!store?.ready && store.comparableKind === 'text'
