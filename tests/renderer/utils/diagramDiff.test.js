import { describe, expect, it } from 'vitest'
import { diffDiagrams } from '../../../src/renderer/src/utils/diagramDiff'

const node = (id, label = id, over = {}) => ({
  id,
  label,
  shape: null,
  isGroup: false,
  parentId: null,
  ...over
})
const edge = (start, end, label = '') => ({ start, end, label })
const model = (nodes, edges = []) => ({ type: 'flowchart-v2', nodes, edges })

const statusOf = (list, id) => list.find((x) => x.id === id)?.status

describe('diffDiagrams — nodes', () => {
  it('reports nothing changed between identical diagrams', () => {
    const m = model([node('A'), node('B')], [edge('A', 'B')])
    const d = diffDiagrams(m, m)
    expect(d.nodes.every((n) => n.status === 'same')).toBe(true)
    expect(d.edges.every((e) => e.status === 'same')).toBe(true)
    expect(d.counts).toMatchObject({ added: 0, removed: 0, changed: 0 })
  })

  it('marks an inserted node added and a deleted one removed', () => {
    const d = diffDiagrams(model([node('A')]), model([node('A'), node('B')]))
    expect(statusOf(d.nodes, 'B')).toBe('added')
    expect(statusOf(d.nodes, 'A')).toBe('same')

    const back = diffDiagrams(model([node('A'), node('B')]), model([node('A')]))
    expect(statusOf(back.nodes, 'B')).toBe('removed')
  })

  // A relabelled node is the same node saying something different — reporting it
  // as an unrelated remove+add loses that.
  it('marks a relabelled node changed and keeps what it was', () => {
    const d = diffDiagrams(model([node('A', 'Start')]), model([node('A', 'Begin')]))
    const a = d.nodes.find((n) => n.id === 'A')
    expect(a.status).toBe('changed')
    expect(a.was).toBe('Start')
    expect(a.label).toBe('Begin')
  })

  it('detects a re-parented node as changed rather than untouched', () => {
    const before = model([node('A', 'A', { parentId: 'g1' })])
    const after = model([node('A', 'A', { parentId: 'g2' })])
    expect(statusOf(diffDiagrams(before, after).nodes, 'A')).toBe('changed')
  })
})

describe('diffDiagrams — edges', () => {
  // The one-character change that changes the topology, and the reason a text
  // diff is the wrong tool for a diagram.
  it('sees a re-pointed edge as one removed and one added', () => {
    const before = model([node('B'), node('D'), node('E')], [edge('B', 'D', 'no')])
    const after = model([node('B'), node('D'), node('E')], [edge('B', 'E', 'no')])
    const d = diffDiagrams(before, after)
    expect(d.edges.find((e) => e.end === 'D').status).toBe('removed')
    expect(d.edges.find((e) => e.end === 'E').status).toBe('added')
  })

  it('marks a relabelled edge changed, not replaced', () => {
    const before = model([node('A'), node('B')], [edge('A', 'B', 'yes')])
    const after = model([node('A'), node('B')], [edge('A', 'B', 'no')])
    const [e] = diffDiagrams(before, after).edges
    expect(e.status).toBe('changed')
    expect(e.was).toBe('yes')
  })
})

describe('diffDiagrams — renames', () => {
  // Reporting a rename as an unrelated remove+add is actively misleading: the
  // reader sees two changes where the author made one.
  it('pairs a removed and an added node that share a label', () => {
    const before = model([node('A', 'Start')])
    const after = model([node('Begin', 'Start')])
    const d = diffDiagrams(before, after)
    const renamed = d.nodes.find((n) => n.status === 'renamed')
    expect(renamed).toMatchObject({ id: 'Begin', wasId: 'A', label: 'Start' })
    expect(d.nodes.some((n) => n.status === 'removed')).toBe(false)
    expect(d.nodes.some((n) => n.status === 'added')).toBe(false)
  })

  it('does not pair when the labels differ', () => {
    const d = diffDiagrams(model([node('A', 'Start')]), model([node('B', 'Finish')]))
    expect(d.nodes.some((n) => n.status === 'renamed')).toBe(false)
    expect(statusOf(d.nodes, 'A')).toBe('removed')
    expect(statusOf(d.nodes, 'B')).toBe('added')
  })

  // Two nodes sharing a label make the pairing ambiguous; guessing would be worse
  // than reporting the plain truth.
  it('does not guess when a label is ambiguous', () => {
    const before = model([node('A', 'Task'), node('B', 'Task')])
    const after = model([node('X', 'Task'), node('Y', 'Task')])
    expect(diffDiagrams(before, after).nodes.some((n) => n.status === 'renamed')).toBe(false)
  })
})

describe('diffDiagrams — edges and counts', () => {
  it('counts what changed', () => {
    const before = model([node('A', 'Start'), node('B')], [edge('A', 'B')])
    const after = model([node('A', 'Begin'), node('C')], [edge('A', 'C')])
    const d = diffDiagrams(before, after)
    expect(d.counts.changed).toBe(1)
    expect(d.counts.added).toBeGreaterThan(0)
    expect(d.counts.removed).toBeGreaterThan(0)
  })

  it('survives an empty side', () => {
    expect(() => diffDiagrams(model([]), model([node('A')]))).not.toThrow()
    expect(diffDiagrams(model([]), model([node('A')])).counts.added).toBe(1)
    expect(diffDiagrams(model([node('A')]), model([])).counts.removed).toBe(1)
  })
})
