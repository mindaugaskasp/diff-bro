import { describe, expect, it } from 'vitest'
import {
  defaultSemanticView,
  hasStatusBand,
  showsSplitView,
  showsWhitespaceToggle
} from '../../../src/renderer/src/utils/viewChrome'

// The floating shortcut bar clears the band only when there IS one, so a wrong
// answer here either covers the change counts or leaves the bar hovering.
const store = (over) => ({
  ready: true,
  comparableKind: 'text',
  stats: null,
  identical: false,
  ...over
})

describe('hasStatusBand', () => {
  it('is false before a comparison is ready', () => {
    expect(hasStatusBand(store({ ready: false }))).toBe(false)
    expect(hasStatusBand(undefined)).toBe(false)
  })

  // Monaco diffs in a worker and hands back null until it returns; the band is
  // not drawn yet, so the bar must not move for it.
  it('waits for the text diff to have a result', () => {
    expect(hasStatusBand(store({ stats: null }))).toBe(false)
    expect(hasStatusBand(store({ stats: { additions: 1, deletions: 0 } }))).toBe(true)
  })

  it('is false for identical text — the band is not drawn', () => {
    expect(hasStatusBand(store({ stats: { additions: 0, deletions: 0 }, identical: true }))).toBe(
      false
    )
  })

  it('is true for the viewers that always draw one', () => {
    for (const kind of ['diagram', 'tree', 'spreadsheet']) {
      expect(hasStatusBand(store({ comparableKind: kind })), kind).toBe(true)
      expect(hasStatusBand(store({ comparableKind: kind, identical: true })), kind).toBe(true)
    }
  })

  // A streamed pair still indexing, or paired with pasted text, renders a
  // message where its band would be — and the second case never resolves, so
  // the shortcut bar would hover permanently.
  it('waits for the streamed pair, which is not always coming', () => {
    const streamed = { comparableKind: 'streamed' }
    expect(hasStatusBand(store({ ...streamed, streamedPairReady: true }))).toBe(true)
    expect(hasStatusBand(store({ ...streamed, streamedPairReady: false }))).toBe(false)
    expect(hasStatusBand(store(streamed))).toBe(false)
  })

  // Paste mode replaces the viewer chain entirely (App.vue), so a comparison
  // can be `ready` with nothing drawn under it.
  it('is false in paste mode, however ready the comparison is', () => {
    expect(hasStatusBand(store({ mode: 'paste', stats: { additions: 1 } }))).toBe(false)
    expect(hasStatusBand(store({ mode: 'paste', comparableKind: 'spreadsheet' }))).toBe(false)
  })
})

// The regression this pair exists to catch: Split view is NOT Monaco-only.
// DiagramDiffViewer reads the same flag to choose between two side-by-side
// renders and one stitched layout, so hiding it there broke a real feature.
describe('showsSplitView', () => {
  it('is offered for a text diff AND a diagram', () => {
    expect(showsSplitView(store({ comparableKind: 'text' }))).toBe(true)
    expect(showsSplitView(store({ comparableKind: 'diagram' }))).toBe(true)
  })

  it('is not offered where nothing reads it', () => {
    for (const kind of ['tree', 'streamed', 'spreadsheet']) {
      expect(showsSplitView(store({ comparableKind: kind })), kind).toBe(false)
    }
  })

  it('is not offered before a comparison exists, or in paste mode', () => {
    expect(showsSplitView(store({ ready: false }))).toBe(false)
    expect(showsSplitView(store({ mode: 'paste' }))).toBe(false)
    expect(showsSplitView(undefined)).toBe(false)
  })
})

describe('showsWhitespaceToggle', () => {
  // This one really is Monaco's alone — diffEditorOptions.js is its only reader.
  it('is offered for a text diff only', () => {
    expect(showsWhitespaceToggle(store({ comparableKind: 'text' }))).toBe(true)
    for (const kind of ['diagram', 'tree', 'streamed', 'spreadsheet']) {
      expect(showsWhitespaceToggle(store({ comparableKind: kind })), kind).toBe(false)
    }
  })

  it('is not offered before a comparison exists', () => {
    expect(showsWhitespaceToggle(store({ ready: false }))).toBe(false)
    expect(showsWhitespaceToggle(undefined)).toBe(false)
  })
})

// Diagrams and grids open in the view they are FOR. Compared as lines, a Mermaid
// pair re-indents everything below an inserted node and a spreadsheet is not
// readable at all, so the toggle was something you had to know to go and find.
describe('defaultSemanticView', () => {
  it('opens a diagram pair as a diagram', () => {
    expect(defaultSemanticView({ canCompareDiagram: true })).toBe(true)
  })

  it('opens a delimited pair as a grid', () => {
    expect(defaultSemanticView({ delimitedFormat: 'csv' })).toBe(true)
  })

  // Structured text (JSON/YAML) keeps the text diff as its default: line order
  // and formatting are usually what you are reviewing there.
  it('leaves structured text on the text diff', () => {
    expect(defaultSemanticView({ structuredFormat: 'json' })).toBe(false)
  })

  it('leaves plain text on the text diff', () => {
    expect(defaultSemanticView({})).toBe(false)
  })

  it('is safe on a missing store', () => {
    expect(defaultSemanticView(null)).toBe(false)
    expect(defaultSemanticView(undefined)).toBe(false)
  })
})
