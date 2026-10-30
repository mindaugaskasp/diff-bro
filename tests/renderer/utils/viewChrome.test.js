import { describe, expect, it } from 'vitest'
import {
  hasSplitPanes,
  restoredSemanticView,
  shouldOpenSemantic,
  showsSplitView,
  showsWhitespaceToggle
} from '../../../src/renderer/src/utils/viewChrome'

const store = (over) => ({
  ready: true,
  comparableKind: 'text',
  stats: null,
  identical: false,
  ...over
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
describe('shouldOpenSemantic', () => {
  it('opens a diagram pair as a diagram', () => {
    expect(shouldOpenSemantic({ canCompareDiagram: true })).toBe(true)
  })

  it('opens a delimited pair as a grid', () => {
    expect(shouldOpenSemantic({ delimitedFormat: 'csv' })).toBe(true)
  })

  // Structured text (JSON/YAML) keeps the text diff as its default: line order
  // and formatting are usually what you are reviewing there.
  it('leaves structured text on the text diff', () => {
    expect(shouldOpenSemantic({ structuredFormat: 'json' })).toBe(false)
  })

  it('leaves plain text on the text diff', () => {
    expect(shouldOpenSemantic({})).toBe(false)
  })

  it('is safe on a missing store', () => {
    expect(shouldOpenSemantic(null)).toBe(false)
    expect(shouldOpenSemantic(undefined)).toBe(false)
  })
})

describe('restoredSemanticView', () => {
  const diagram = { canCompareDiagram: true }

  it('keeps the view the snapshot recorded, either way', () => {
    expect(restoredSemanticView({ semanticView: false }, diagram)).toBe(false)
    expect(restoredSemanticView({ semanticView: true }, {})).toBe(true)
  })

  it('takes it from the files when the snapshot recorded none', () => {
    expect(restoredSemanticView({}, diagram)).toBe(true)
    expect(restoredSemanticView({}, { delimitedFormat: 'csv' })).toBe(true)
    expect(restoredSemanticView({}, { structuredFormat: 'json' })).toBe(false)
  })

  it('treats a non-boolean as no record at all', () => {
    expect(restoredSemanticView({ semanticView: 'yes' }, diagram)).toBe(true)
    expect(restoredSemanticView(null, diagram)).toBe(true)
  })
})

describe('hasSplitPanes', () => {
  it('splits a side-by-side text or diagram view, and every spreadsheet', () => {
    expect(hasSplitPanes(store({ renderSideBySide: true }))).toBe(true)
    expect(hasSplitPanes(store({ comparableKind: 'diagram', renderSideBySide: true }))).toBe(true)
    expect(hasSplitPanes(store({ comparableKind: 'spreadsheet', renderSideBySide: false }))).toBe(
      true
    )
  })

  it('joins an inline view and the single-column viewers', () => {
    expect(hasSplitPanes(store({ renderSideBySide: false }))).toBe(false)
    for (const kind of ['tree', 'deps', 'streamed'])
      expect(hasSplitPanes(store({ comparableKind: kind, renderSideBySide: true })), kind).toBe(
        false
      )
  })

  it('splits the waiting state, where one side is loaded', () => {
    expect(hasSplitPanes(store({ ready: false, renderSideBySide: false }))).toBe(true)
  })
})
