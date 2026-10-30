// Which chrome a comparison supports. Facts about the VIEW, kept out of the
// components so they are testable and so the toolbar cannot answer one of them
// differently from the viewer that actually reads the state.

/**
 * Split view is NOT a Monaco-only option: the diagram viewer reads the same flag
 * to choose between two side-by-side renders and one stitched layout
 * (DiagramDiffViewer.vue). It means nothing to a grid, a structure tree or a
 * streamed comparison, and a control that cannot act reads as broken.
 * @param {object} store
 * @returns {boolean}
 */
export const showsSplitView = (store) =>
  !!store?.ready &&
  store.mode !== 'paste' &&
  (store.comparableKind === 'text' || store.comparableKind === 'diagram')

/**
 * Whether each side is named over its own half, or both together at the top right.
 * @param {object} store
 * @returns {boolean}
 */
export const hasSplitPanes = (store) =>
  !store.ready ||
  store.comparableKind === 'spreadsheet' ||
  (['text', 'diagram'].includes(store.comparableKind) && !!store.renderSideBySide)

/**
 * Ignore-whitespace really is Monaco's alone (diffEditorOptions.js) — no other
 * viewer reads it.
 * @param {object} store
 * @returns {boolean}
 */
export const showsWhitespaceToggle = (store) =>
  !!store?.ready && store.mode !== 'paste' && store.comparableKind === 'text'

/**
 * Which view a freshly loaded pair opens in. Diagrams and grids open in the view
 * they are FOR: a Mermaid pair read as lines re-indents everything below an
 * inserted node, and a spreadsheet read as lines is not readable at all. Applied
 * per comparison, so an explicit untick stands until the next pair arrives.
 * @param {object} store
 * @returns {boolean}
 */
export const shouldOpenSemantic = (store) =>
  !!store?.canCompareDiagram || !!store?.canCompareDeps || !!store?.delimitedFormat

/**
 * The view a restored snapshot opens in: the one it recorded, or — where it
 * recorded none, having been saved before the diagram view or by a bundle that
 * never wrote it — whatever the files themselves ask for.
 */
export const restoredSemanticView = (payload, store) =>
  typeof payload?.semanticView === 'boolean' ? payload.semanticView : shouldOpenSemantic(store)
