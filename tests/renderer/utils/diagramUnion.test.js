import { describe, expect, it } from 'vitest'
import { unionSource } from '../../../src/renderer/src/utils/diagramUnion'
import { modelFrom } from '../../../src/renderer/src/utils/diagramModel'
import { diffDiagrams } from '../../../src/renderer/src/utils/diagramDiff'

const union = async (before, after) => {
  const [a, b] = [await modelFrom(before), await modelFrom(after)]
  return unionSource(diffDiagrams(a, b), b.type)
}

describe('unionSource', () => {
  it('emits one diagram carrying both revisions', async () => {
    const src = await union(
      'flowchart TD\n  A[Start] --> B[Mid]\n',
      'flowchart TD\n  A[Start] --> C[New]\n'
    )
    expect(src).toMatch(/^flowchart TD/)
    // Both the gone node and the arrived one are present, so a single layout
    // holds them and unchanged nodes cannot drift between two renders.
    expect(src).toContain('B')
    expect(src).toContain('C')
    expect(src).toMatch(/:::removed/)
    expect(src).toMatch(/:::added/)
  })

  // classDef compiles to inline `style="fill:… !important"` on the shape —
  // a hardcoded colour no theme can re-tint, which fails the 14-theme rule.
  it('never emits a classDef', async () => {
    const src = await union('flowchart TD\n  A --> B\n', 'flowchart TD\n  A --> C\n')
    expect(src).not.toMatch(/classDef/i)
    expect(src).not.toMatch(/style\s+\w+\s+fill:/i)
  })

  // An edge carries status too, or a re-pointed arrow — the one-character change
  // a text diff reads worst — arrives as a grey line like any other.
  it('classes each edge by its status', async () => {
    const src = await union(
      'flowchart TD\n  A[A] --> B[B]\n',
      'flowchart TD\n  A[A] --> C[C]\n'
    )
    expect(src).toMatch(/e\d+@-->/)
    expect(src).toMatch(/^\s*class e\d+ added$/m)
    expect(src).toMatch(/^\s*class e\d+ removed$/m)
    // `class` is a statement, not a classDef — no inline style is emitted.
    expect(src).not.toMatch(/classDef/i)
  })

  it('marks an unchanged node as same rather than leaving it bare', async () => {
    const src = await union('flowchart TD\n  A[Keep] --> B\n', 'flowchart TD\n  A[Keep] --> B\n')
    expect(src).toMatch(/:::same/)
  })

  it('re-parses: what it emits is a diagram mermaid accepts', async () => {
    const src = await union(
      'flowchart TD\n  A[Start] --> B[Mid]\n',
      'flowchart TD\n  A[Start] --> C[New]\n'
    )
    const back = await modelFrom(src)
    expect(back.error).toBeUndefined()
    expect(back.nodes.map((n) => n.id).sort()).toEqual(['A', 'B', 'C'])
  })
})

// The union source is GENERATED FROM THE COMPARED FILES, so a node label is
// attacker-controlled text being written back into Mermaid syntax. Rule 6.
describe('unionSource — a hostile label cannot alter the graph', () => {
  const hostile = async (label) => {
    const after = `flowchart TD\n  A["${label}"] --> B[Ok]\n`
    const src = await union('flowchart TD\n  A[Before] --> B[Ok]\n', after)
    return { src, back: await modelFrom(src) }
  }

  // The word may survive as label TEXT — mangling a label that legitimately
  // mentions classDef would be wrong. What must not survive is a classDef
  // STATEMENT, which means the word starting a line of its own.
  it('cannot inject a classDef through a label', async () => {
    const { src, back } = await hostile('x\n classDef evil fill:#f00')
    expect(src.split('\n').some((l) => /^\s*classDef/i.test(l))).toBe(false)
    expect(back.error).toBeUndefined()
    expect(back.nodes).toHaveLength(2)
    // And the label is still one node's text, not a style rule.
    expect(back.nodes.find((n) => n.id === 'A').label).toContain('classDef')
  })

  it('cannot inject an init directive through a label', async () => {
    const { src, back } = await hostile('%%{init: {"theme":"dark"}}%%')
    expect(src).not.toContain('%%{')
    expect(back.error).toBeUndefined()
    expect(back.nodes).toHaveLength(2)
  })

  it('cannot add an edge or a node through a label', async () => {
    const { back } = await hostile('a --> EVIL[pwned]')
    expect(back.error).toBeUndefined()
    // Still exactly the two nodes the diagram declared.
    expect(back.nodes).toHaveLength(2)
    expect(back.nodes.map((n) => n.id)).not.toContain('EVIL')
  })

  it('survives a label full of quotes and brackets', async () => {
    const { back } = await hostile('he said "hi" [and] {this}')
    expect(back.error).toBeUndefined()
    expect(back.nodes).toHaveLength(2)
  })
})
