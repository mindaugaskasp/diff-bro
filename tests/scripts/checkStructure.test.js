// The structure guard: import cycles, and legacy-size entries that have gone
// stale. Both cores are pure so they are driven with literal graphs here rather
// than by walking the real tree — a guard tested against the source it guards
// passes for as long as the source happens to be clean.
import { describe, expect, it } from 'vitest'
import { buildGraph, cycleKey, findCycles, staleEntries } from '../../scripts/lib/structure.mjs'

const graphOf = (edges) => new Map(Object.entries(edges))

describe('findCycles', () => {
  it('reports a two-file cycle', () => {
    const cycles = findCycles(graphOf({ 'a.js': ['b.js'], 'b.js': ['a.js'] }))
    expect(cycles).toHaveLength(1)
    expect([...cycles[0]].sort()).toEqual(['a.js', 'b.js'])
  })

  it('reports a longer cycle once, not once per entry point', () => {
    const cycles = findCycles(
      graphOf({ 'a.js': ['b.js'], 'b.js': ['c.js'], 'c.js': ['a.js'], 'd.js': ['a.js'] })
    )
    expect(cycles).toHaveLength(1)
    expect([...cycles[0]].sort()).toEqual(['a.js', 'b.js', 'c.js'])
  })

  // A shared dependency is the shape most naive detectors get wrong: both paths
  // reach d, neither returns.
  it('does not report a diamond', () => {
    expect(
      findCycles(graphOf({ 'a.js': ['b.js', 'c.js'], 'b.js': ['d.js'], 'c.js': ['d.js'] }))
    ).toEqual([])
  })

  // JsonTree.vue and XmlTree.vue render themselves; that is how a recursive tree
  // is written, not a cycle to break.
  it('does not report a self-edge', () => {
    expect(findCycles(graphOf({ 'JsonTree.vue': ['JsonTree.vue'] }))).toEqual([])
  })

  it('reports two independent cycles separately', () => {
    const cycles = findCycles(
      graphOf({ 'a.js': ['b.js'], 'b.js': ['a.js'], 'x.js': ['y.js'], 'y.js': ['x.js'] })
    )
    expect(cycles).toHaveLength(2)
  })

  it('survives an edge to a file that is not in the graph', () => {
    expect(() => findCycles(graphOf({ 'a.js': ['missing.js'] }))).not.toThrow()
  })
})

describe('cycleKey', () => {
  // The baseline is matched by member set: which file the walk happened to enter
  // from is an artefact of directory order, and keying on it would mint a false
  // positive the first time a file is renamed.
  it('is the same wherever the walk entered the cycle', () => {
    expect(cycleKey(['a.js', 'b.js', 'c.js'])).toBe(cycleKey(['c.js', 'a.js', 'b.js']))
  })

  it('differs when a member differs', () => {
    expect(cycleKey(['a.js', 'b.js'])).not.toBe(cycleKey(['a.js', 'z.js']))
  })
})

describe('buildGraph', () => {
  const read = (f) =>
    ({
      'src/a.js': "import { x } from './b'\nimport { y } from './sub/c.js'",
      'src/b.js': "export const x = 1\nimport pkg from 'pinia'",
      'src/sub/c.js': "import { x } from '../b'",
      'src/sub/index.js': ''
    })[f]

  const files = ['src/a.js', 'src/b.js', 'src/sub/c.js', 'src/sub/index.js']

  it('resolves a relative import with no extension', () => {
    expect(buildGraph(files, read).get('src/a.js')).toContain('src/b.js')
  })

  it('resolves one that already carries its extension', () => {
    expect(buildGraph(files, read).get('src/a.js')).toContain('src/sub/c.js')
  })

  it('resolves a parent-relative import', () => {
    expect(buildGraph(files, read).get('src/sub/c.js')).toEqual(['src/b.js'])
  })

  // A bare specifier is a package, not a file in this tree; following it would
  // walk into node_modules.
  it('ignores a bare package specifier', () => {
    expect(buildGraph(files, read).get('src/b.js')).toEqual([])
  })
})

describe('staleEntries', () => {
  const legacy = { 'src/big.js': { fn: 100, file: 300 } }

  it('is silent when the file measures exactly its cap', () => {
    expect(staleEntries(legacy, { 'src/big.js': { fn: 100, file: 300 } })).toEqual([])
  })

  // Beating a cap and leaving the entry behind is how a ratchet rots into
  // permanent permission: the number stops describing anything.
  it('flags an entry the file has beaten', () => {
    const stale = staleEntries(legacy, { 'src/big.js': { fn: 100, file: 240 } })
    expect(stale).toHaveLength(1)
    expect(stale[0]).toMatchObject({ file: 'src/big.js', kind: 'file', cap: 300, actual: 240 })
  })

  it('flags a beaten function cap independently of the file cap', () => {
    const stale = staleEntries(legacy, { 'src/big.js': { fn: 55, file: 300 } })
    expect(stale).toEqual([{ file: 'src/big.js', kind: 'fn', cap: 100, actual: 55 }])
  })

  it('flags an entry whose file no longer exists', () => {
    expect(staleEntries(legacy, {})).toEqual([
      { file: 'src/big.js', kind: 'gone', cap: 0, actual: 0 }
    ])
  })

  it('says nothing about a file with no entry', () => {
    expect(staleEntries({}, { 'src/big.js': { fn: 10, file: 20 } })).toEqual([])
  })
})
