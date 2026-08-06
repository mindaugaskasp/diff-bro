// The Diagram view: which comparisons offer it, and what it routes to.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {}
})

// The Diagram toggle reuses the Structure checkbox — a second control would be
// the repo's recurring "second bespoke copy". So the getters have to agree.
describe('diagram comparison', () => {
  const mmd = (body) => `flowchart TD\n${body}\n`
  const load = (diff, l, r) => {
    diff.left = { path: '/a.mmd', name: 'a.mmd', content: l }
    diff.right = { path: '/b.mmd', name: 'b.mmd', content: r }
    diff.mode = 'files'
  }

  it('offers the toggle only when both sides look like Mermaid', () => {
    const diff = useDiffStore()
    load(diff, mmd('  A --> B'), mmd('  A --> C'))
    expect(diff.canCompareDiagram).toBe(true)

    load(diff, mmd('  A --> B'), 'just some text')
    expect(diff.canCompareDiagram).toBe(false)
  })

  it('calls itself Diagram, not Structure', () => {
    const diff = useDiffStore()
    load(diff, mmd('  A --> B'), mmd('  A --> C'))
    expect(diff.structureLabelKey).toBe('appToolbar.structureDiagram')
  })

  it('routes to the diagram viewer only with the toggle on', () => {
    const diff = useDiffStore()
    load(diff, mmd('  A --> B'), mmd('  A --> C'))
    diff.semanticView = false
    expect(diff.comparableKind).toBe('text')
    diff.semanticView = true
    expect(diff.comparableKind).toBe('diagram')
  })

  it('never offers it for a streamed comparison', () => {
    const diff = useDiffStore()
    load(diff, mmd('  A --> B'), mmd('  A --> C'))
    diff.left = { ...diff.left, kind: 'streamed' }
    expect(diff.canCompareDiagram).toBe(false)
  })
})

// Pasted text is a comparison like any other — comparePasted() fills left/right,
// so the Diagram toggle must be offered there too.
describe('diagram comparison from pasted text', () => {
  it('offers the diagram view after comparing two pasted diagrams', () => {
    const diff = useDiffStore()
    diff.mode = 'paste'
    diff.pasteLeft = 'flowchart TD\n  A --> B'
    diff.pasteRight = 'flowchart TD\n  A --> C'
    diff.comparePasted()
    expect(diff.canCompareDiagram).toBe(true)
    diff.semanticView = true
    expect(diff.comparableKind).toBe('diagram')
  })
})
