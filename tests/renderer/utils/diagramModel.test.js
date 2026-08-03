import { describe, expect, it } from 'vitest'
import { modelFrom, SUPPORTED_DIAGRAMS } from '../../../src/renderer/src/utils/diagramModel'

// mermaid's own parser is the source of truth — hand-writing one would duplicate
// the grammar and drift on every release. It runs in jsdom with no rendering, so
// the whole model layer stays a pure unit.

describe('modelFrom — the four types that share getData()', () => {
  it('normalises a flowchart to nodes and edges', async () => {
    const m = await modelFrom('flowchart TD\n  A[Start] --> B{Ok?}\n  B -- yes --> C[Ship]\n')
    expect(m.error).toBeUndefined()
    expect(m.nodes.map((n) => n.id).sort()).toEqual(['A', 'B', 'C'])
    expect(m.nodes.find((n) => n.id === 'A').label).toBe('Start')
    expect(m.edges).toHaveLength(2)
    expect(m.edges.map((e) => `${e.start}->${e.end}`).sort()).toEqual(['A->B', 'B->C'])
    expect(m.edges.find((e) => e.end === 'C').label).toBe('yes')
  })

  it('normalises a state diagram', async () => {
    const m = await modelFrom('stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy: go\n')
    expect(m.nodes.length).toBeGreaterThan(0)
    expect(m.edges.some((e) => e.end === 'Busy' && e.label === 'go')).toBe(true)
  })

  it('normalises a class diagram', async () => {
    const m = await modelFrom('classDiagram\n  Animal <|-- Dog\n')
    expect(m.nodes.map((n) => n.id).sort()).toEqual(['Animal', 'Dog'])
    expect(m.edges).toHaveLength(1)
  })

  // An ER node's own id carries a per-parse counter (entity-CUSTOMER-0), so it
  // is NOT stable: inserting an entity above shifts every id below it and the
  // whole diagram would read as rewritten.
  it('strips the per-parse counter from ER ids so a diff can key on them', async () => {
    const one = await modelFrom('erDiagram\n  CUSTOMER ||--o{ ORDER : places\n')
    const two = await modelFrom(
      'erDiagram\n  NEW ||--o{ THING : x\n  CUSTOMER ||--o{ ORDER : places\n'
    )
    expect(one.nodes.map((n) => n.id).sort()).toEqual(['CUSTOMER', 'ORDER'])
    // CUSTOMER keeps its identity even though it parsed at a different position.
    expect(two.nodes.map((n) => n.id)).toContain('CUSTOMER')
  })

  it('names the type it recognised', async () => {
    const m = await modelFrom('flowchart TD\n  A --> B\n')
    expect(SUPPORTED_DIAGRAMS).toContain(m.type)
  })
})

describe('modelFrom — what it refuses', () => {
  it('returns an error rather than throwing on unparseable source', async () => {
    const m = await modelFrom('flowchart TD\n  A -->\n')
    expect(m.error).toBeTruthy()
    expect(m.nodes).toBeUndefined()
  })

  // Each of these exposes a bespoke model (getActors/getSections/getCommits)
  // with no shared shape, so each would be its own extractor.
  it('returns null for a type this does not model', async () => {
    expect(await modelFrom('sequenceDiagram\n  A->>B: hi\n')).toBeNull()
    expect(await modelFrom('pie\n  "a" : 10\n')).toBeNull()
  })

  it('returns an error for empty or non-diagram text', async () => {
    expect((await modelFrom('')).error).toBeTruthy()
    expect((await modelFrom('just some prose')).error).toBeTruthy()
  })
})
