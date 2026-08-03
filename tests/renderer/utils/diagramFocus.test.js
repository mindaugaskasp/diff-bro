import { describe, expect, it } from 'vitest'
import { focusDiff } from '../../../src/renderer/src/utils/diagramFocus'

const n = (id, status = 'same') => ({ id, label: id, status, parentId: null })
const e = (start, end, status = 'same') => ({ start, end, label: '', status })

// A 40-node diagram with one change is scroll-and-hope. Focus keeps the change
// and the ring of context that makes it legible, and says how much it hid.
const chain = (ids, changedId) => ({
  nodes: ids.map((id) => n(id, id === changedId ? 'changed' : 'same')),
  edges: ids.slice(1).map((id, i) => e(ids[i], id))
})

describe('focusDiff', () => {
  const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

  it('radius 0 keeps only what changed', () => {
    const f = focusDiff(chain(ids, 'D'), 0)
    expect(f.nodes.map((x) => x.id)).toEqual(['D'])
    expect(f.hidden).toBe(6)
  })

  it('radius 1 keeps the immediate neighbours', () => {
    const f = focusDiff(chain(ids, 'D'), 1)
    expect(f.nodes.map((x) => x.id).sort()).toEqual(['C', 'D', 'E'])
    expect(f.hidden).toBe(4)
  })

  it('radius 2 reaches two hops out', () => {
    expect(
      focusDiff(chain(ids, 'D'), 2)
        .nodes.map((x) => x.id)
        .sort()
    ).toEqual(['B', 'C', 'D', 'E', 'F'])
  })

  it('keeps only edges whose both ends survived', () => {
    const f = focusDiff(chain(ids, 'D'), 1)
    for (const edge of f.edges) {
      const kept = new Set(f.nodes.map((x) => x.id))
      expect(kept.has(edge.start) && kept.has(edge.end)).toBe(true)
    }
  })

  it('hides nothing when everything changed', () => {
    const all = { nodes: ids.map((id) => n(id, 'added')), edges: [] }
    expect(focusDiff(all, 0).hidden).toBe(0)
  })

  it('keeps the whole diagram when nothing changed, rather than blanking it', () => {
    const f = focusDiff(chain(ids, null), 1)
    expect(f.nodes).toHaveLength(ids.length)
    expect(f.hidden).toBe(0)
  })

  it('counts renamed and removed as changes worth focusing on', () => {
    const g = { nodes: [n('A'), n('B', 'renamed'), n('C', 'removed')], edges: [] }
    expect(
      focusDiff(g, 0)
        .nodes.map((x) => x.id)
        .sort()
    ).toEqual(['B', 'C'])
  })
})
