// Structure-aware diff: two documents are compared as data, so reordering keys
// or reformatting is not a change, and a change is reported where it happened
// rather than as a run of rewritten lines.
import { describe, expect, it } from 'vitest'
import {
  MAX_TREE_DEPTH,
  MAX_TREE_ROWS,
  diffStructures,
  parseStructured,
  structuredKind
} from '../../../src/renderer/src/utils/structuralDiff'
import { visibleStructureRows } from '../../../src/renderer/src/utils/structureRows'

const rowsOf = (a, b) => diffStructures(a, b).rows
const at = (rows, path) => rows.find((r) => r.path === path)
const statuses = (rows) => rows.map((r) => `${r.path}:${r.status}`)

describe('parseStructured', () => {
  it('reads JSON into a plain value', () => {
    expect(parseStructured('{"a":1}', 'json')).toEqual({ value: { a: 1 } })
  })

  it('reports malformed JSON rather than throwing', () => {
    expect(parseStructured('{"a":', 'json').error).toBeTruthy()
  })

  it('reads XML, with attributes and text as fields', () => {
    const { value } = parseStructured('<r id="1"><name>bro</name></r>', 'xml')
    expect(value).toEqual({ r: { '@id': '1', name: 'bro' } })
  })

  it('groups repeated child elements into a list, keeping their order', () => {
    const { value } = parseStructured('<r><i>a</i><i>b</i></r>', 'xml')
    expect(value).toEqual({ r: { i: ['a', 'b'] } })
  })

  it('names the format both sides share, or nothing when they disagree', () => {
    const f = (name, content) => ({ name, content })
    expect(structuredKind(f('a.json', '{"a":1}'), f('b.json', '{"a":2}'))).toBe('json')
    expect(structuredKind(f('a.xml', '<a/>'), f('b.xml', '<b/>'))).toBe('xml')
    expect(structuredKind(f('a.json', '{"a":1}'), f('b.xml', '<a/>'))).toBeNull()
    expect(structuredKind(f('a.txt', 'hello'), f('b.txt', 'there'))).toBeNull()
    expect(structuredKind(f('a.json', '{"a":'), f('b.json', '{"a":1}'))).toBeNull()
  })
})

describe('what counts as a change', () => {
  it('ignores key order', () => {
    const { rows, stats } = diffStructures({ a: 1, b: 2 }, { b: 2, a: 1 })
    expect(stats).toEqual({ added: 0, removed: 0, changed: 0 })
    expect(rows.every((r) => r.status === 'same')).toBe(true)
  })

  it('ignores formatting, because it never sees any', () => {
    const a = parseStructured('{ "a" : 1 }', 'json').value
    const b = parseStructured('{\n  "a": 1\n}', 'json').value
    expect(diffStructures(a, b).stats.changed).toBe(0)
  })

  it('reports a changed value with both sides', () => {
    const row = at(rowsOf({ port: 8080 }, { port: 9090 }), 'port')
    expect(row.status).toBe('changed')
    expect(row.left).toBe('8080')
    expect(row.right).toBe('9090')
  })

  it('distinguishes a type change from a value change', () => {
    const row = at(rowsOf({ port: 8080 }, { port: '8080' }), 'port')
    expect(row.status).toBe('changed')
    expect(row.leftType).toBe('number')
    expect(row.rightType).toBe('string')
  })

  it('reports added and removed keys', () => {
    const rows = rowsOf({ keep: 1, gone: 2 }, { keep: 1, fresh: 3 })
    expect(at(rows, 'gone').status).toBe('removed')
    expect(at(rows, 'fresh').status).toBe('added')
    expect(at(rows, 'keep').status).toBe('same')
  })

  it('walks into nested objects and names the path', () => {
    const rows = rowsOf({ db: { host: 'a', port: 1 } }, { db: { host: 'b', port: 1 } })
    expect(at(rows, 'db.host').status).toBe('changed')
    expect(at(rows, 'db.port').status).toBe('same')
    expect(at(rows, 'db').container).toBe(true)
  })

  it('marks a whole added subtree, children included', () => {
    const rows = rowsOf({}, { db: { host: 'a' } })
    expect(at(rows, 'db').status).toBe('added')
    expect(at(rows, 'db.host').status).toBe('added')
  })

  it('treats an object replaced by a scalar as one change, not a merge', () => {
    const rows = rowsOf({ db: { host: 'a' } }, { db: 'off' })
    expect(at(rows, 'db').status).toBe('changed')
    expect(rows.some((r) => r.path === 'db.host')).toBe(false)
  })
})

describe('arrays', () => {
  it('keeps order significant', () => {
    const { stats } = diffStructures([1, 2], [2, 1])
    // A moved item reads as one leaving and one arriving, never as "no change".
    expect(stats.added + stats.removed + stats.changed).toBeGreaterThan(0)
  })

  it('aligns around an insertion instead of cascading', () => {
    const { rows, stats } = diffStructures(['a', 'c'], ['a', 'b', 'c'])
    expect(stats).toEqual({ added: 1, removed: 0, changed: 0 })
    expect(statuses(rows).filter((s) => s.endsWith(':added'))).toHaveLength(1)
  })

  it('aligns around a removal too', () => {
    expect(diffStructures(['a', 'b', 'c'], ['a', 'c']).stats).toEqual({
      added: 0,
      removed: 1,
      changed: 0
    })
  })

  it('compares objects inside an array by structure', () => {
    const left = [{ id: 1, on: true }]
    const right = [{ on: true, id: 1 }]
    expect(diffStructures(left, right).stats.changed).toBe(0)
  })
})

describe('the shape the viewer renders', () => {
  it('is a flat list carrying its own depth, deepest key last', () => {
    const rows = rowsOf({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } })
    expect(at(rows, 'a').depth).toBe(0)
    expect(at(rows, 'a.b').depth).toBe(1)
    expect(at(rows, 'a.b.c').depth).toBe(2)
  })

  it('orders keys the same way whichever side they came from', () => {
    const one = rowsOf({ b: 1, a: 1 }, { a: 1, b: 1 }).map((r) => r.path)
    const two = rowsOf({ a: 1, b: 1 }, { b: 1, a: 1 }).map((r) => r.path)
    expect(one).toEqual(two)
    expect(one).toEqual(['a', 'b'])
  })

  it('counts every difference once', () => {
    const { stats } = diffStructures(
      { same: 1, gone: 2, moved: { x: 1 } },
      { same: 1, added: 3, moved: { x: 2 } }
    )
    expect(stats).toEqual({ added: 1, removed: 1, changed: 1 })
  })

  it('survives a document that is just a scalar', () => {
    expect(diffStructures(1, 2).stats.changed).toBe(1)
  })
})

// Two rows sharing a path collided in the viewer: the same v-for key, and an
// unchanged row inheriting a changed one's visibility.
describe('every row has its own path', () => {
  const paths = (a, b) => diffStructures(a, b).rows.map((r) => r.path)

  it('gives an inserted item its own slot, not the one it displaced', () => {
    const p = paths({ tags: ['a', 'c'] }, { tags: ['a', 'b', 'c'] })
    expect(new Set(p).size).toBe(p.length)
    expect(p).toEqual(['tags', 'tags.0', 'tags.1', 'tags.2'])
  })

  it('stays unique when an item is removed too', () => {
    const p = paths({ tags: ['a', 'b', 'c'] }, { tags: ['a', 'c'] })
    expect(new Set(p).size).toBe(p.length)
  })

  it('stays unique across a nested mix of insertions and removals', () => {
    const p = paths(
      { a: [1, 2, 3], b: { c: [{ x: 1 }] } },
      { a: [1, 3, 4], b: { c: [{ x: 1 }, { x: 2 }] } }
    )
    expect(new Set(p).size).toBe(p.length)
  })
})

// A big document is a big tree. The viewer draws a row per node with no
// virtualization, so an uncapped result is a frozen window — the spreadsheet
// grid caps for the same reason.
describe('very large documents', () => {
  const wide = (n, tweak = 0) =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, i + tweak]))

  it('caps the rows it hands back and says how many it held', () => {
    const { rows, hidden } = diffStructures(wide(MAX_TREE_ROWS + 500), wide(MAX_TREE_ROWS + 500, 1))
    expect(rows.length).toBeLessThanOrEqual(MAX_TREE_ROWS)
    expect(hidden).toBeGreaterThan(0)
  })

  it('leaves a document under the cap whole', () => {
    const { rows, hidden } = diffStructures(wide(10), wide(10, 1))
    expect(rows).toHaveLength(10)
    expect(hidden).toBe(0)
  })

  it('still counts every difference, including the ones it did not draw', () => {
    const n = MAX_TREE_ROWS + 500
    expect(diffStructures(wide(n), wide(n, 1)).stats.changed).toBe(n)
  })
})

// YAML joins JSON and XML on the structural path. It has no bracket delimiters
// to sniff, so the FORMAT comes from the filename and is confirmed by a parse.
describe('YAML', () => {
  const yml = (name, content) => ({ name, content })

  it('parses into the same plain values JSON does', () => {
    expect(parseStructured('a: 1\nb:\n  - x\n  - y\n', 'yaml')).toEqual({
      value: { a: 1, b: ['x', 'y'] }
    })
  })

  it('reports malformed YAML rather than throwing', () => {
    expect(parseStructured('a: [1, 2\n', 'yaml').error).toBeTruthy()
  })

  it('is offered for two .yaml files that both parse', () => {
    expect(structuredKind(yml('a.yaml', 'a: 1'), yml('b.yml', 'a: 2'))).toBe('yaml')
  })

  it('is not offered when one side does not parse', () => {
    expect(structuredKind(yml('a.yaml', 'a: ['), yml('b.yaml', 'a: 1'))).toBeNull()
  })

  it('is not offered across formats', () => {
    expect(structuredKind(yml('a.yaml', 'a: 1'), yml('b.json', '{"a":1}'))).toBeNull()
  })

  it('compares as data, so re-indenting and reordering are not changes', () => {
    const a = parseStructured('b: 2\na: 1\n', 'yaml').value
    const b = parseStructured('a:    1\nb:    2\n', 'yaml').value
    expect(diffStructures(a, b).stats).toEqual({ added: 0, removed: 0, changed: 0 })
  })

  it('finds a changed value inside a nested map', () => {
    const a = parseStructured('db:\n  host: local\n  port: 5432\n', 'yaml').value
    const b = parseStructured('db:\n  port: 5432\n  host: prod\n', 'yaml').value
    const rows = diffStructures(a, b).rows
    expect(rows.find((r) => r.path === 'db.host').status).toBe('changed')
    expect(rows.find((r) => r.path === 'db.port').status).toBe('same')
  })

  // Untrusted input is hostile (docs/standards.md #6): an anchor bomb must not be
  // allowed to expand until the renderer dies.
  it('refuses an alias bomb instead of expanding it', () => {
    const bomb = [
      'a: &a ["x","x","x","x","x","x","x","x","x"]',
      'b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]',
      'c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]',
      'd: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c]',
      'e: [*d,*d,*d,*d,*d,*d,*d,*d,*d]'
    ].join('\n')
    expect(parseStructured(bomb, 'yaml').error).toBeTruthy()
  })
})

// A dotted key is ordinary in Helm/ConfigMap data blocks, flattened property
// files and log4j configs — it must not be able to impersonate a nested path.
describe('paths are unambiguous', () => {
  it('keeps a dotted key distinct from the nesting it looks like', () => {
    const { rows } = diffStructures({ 'a.b': 1, a: { b: 2 } }, { 'a.b': 9, a: { b: 2 } })
    const paths = rows.map((r) => r.path)
    expect(new Set(paths).size).toBe(paths.length)
    // The one that CHANGED is the flat key, not the nested leaf.
    const changed = rows.filter((r) => r.status === 'changed')
    expect(changed).toHaveLength(1)
    expect(changed[0].label).toBe('a.b')
  })

  it('gives every row a parent that resolves to another row', () => {
    const { rows } = diffStructures({ 'a.b': 1, a: { b: 2 } }, { 'a.b': 9, a: { b: 2 } })
    const byPath = new Map(rows.map((r) => [r.path, r]))
    for (const row of rows) {
      if (row.parent === null) continue
      expect(byPath.has(row.parent)).toBe(true)
    }
  })

  it('does not drop a container held under an empty-string key', () => {
    const { rows } = diffStructures({ '': { x: 1 } }, { '': { x: 2 } })
    expect(rows.some((r) => r.container && r.label === '')).toBe(true)
    expect(rows.find((r) => r.label === 'x').status).toBe('changed')
  })
})

describe('visibleStructureRows', () => {
  it('keeps a changed row and its ancestors, and drops unrelated ones', () => {
    const { rows } = diffStructures(
      { db: { host: 'local', port: 1 }, other: { k: 'v' } },
      { db: { host: 'prod', port: 1 }, other: { k: 'v' } }
    )
    const labels = visibleStructureRows(rows, false).map((r) => r.path)
    expect(labels).toContain('db')
    expect(labels).toContain('db.host')
    expect(labels).not.toContain('db.port')
    expect(labels).not.toContain('other')
  })

  it('walks ancestors by structure, so a dotted key cannot reveal a sibling', () => {
    const { rows } = diffStructures({ 'a.b': 1, a: { b: 2 } }, { 'a.b': 9, a: { b: 2 } })
    const shown = visibleStructureRows(rows, false).map((r) => r.label)
    // The nested a.b leaf is unchanged and has no changed descendant.
    expect(shown).toEqual(['a.b'])
  })

  it('returns everything when the reader asks for the whole document', () => {
    const { rows } = diffStructures({ a: { b: 1 } }, { a: { b: 2 } })
    expect(visibleStructureRows(rows, true)).toBe(rows)
  })
})

// canonical(), walk() and compare() each recurse per nesting level, so a deep
// enough document overflowed the stack — a blank pane and a log line rather than
// a comparison. XML element names are attacker-controlled too, and a plain
// object turns one named __proto__ into a prototype re-point that silently drops
// the row instead of comparing it.
describe('hostile shapes', () => {
  const nest = (n, leaf = 1) => {
    let v = leaf
    for (let i = 0; i < n; i++) v = { a: v }
    return v
  }

  it('compares a document nested far past the ceiling without overflowing', () => {
    const left = nest(MAX_TREE_DEPTH * 5)
    const right = nest(MAX_TREE_DEPTH * 5, 2)
    const out = diffStructures(left, right)
    expect(out.rows.length).toBeGreaterThan(0)
    expect(out.rows.length).toBeLessThan(MAX_TREE_DEPTH * 5)
  })

  it('does not overflow on a deeply nested array either', () => {
    let deep = ['leaf']
    for (let i = 0; i < MAX_TREE_DEPTH * 5; i++) deep = [deep]
    expect(() => diffStructures(deep, deep)).not.toThrow()
  })

  // XML element names come straight from the file. Built into a plain object,
  // one named __proto__ re-points that object's prototype instead of becoming a
  // key, so the element vanishes from the comparison rather than being diffed.
  it('compares an XML element named __proto__ instead of dropping it', () => {
    const xml = (v) => `<r><__proto__>${v}</__proto__></r>`
    const left = parseStructured(xml('a'), 'xml')
    const right = parseStructured(xml('b'), 'xml')
    expect(left.error ?? right.error).toBeUndefined()
    const rows = diffStructures(left.value, right.value).rows
    const element = rows.find((r) => r.label === '__proto__')
    expect(element, 'the element must appear in the comparison at all').toBeTruthy()
    expect(element.status).toBe('changed')
  })
})
