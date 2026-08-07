import { describe, expect, it } from 'vitest'
import {
  composeHints,
  listHints,
  previewHints,
  rank,
  resultRows,
  scoreItem,
  snippetRows,
  NO_MATCH
} from '../../../src/renderer/src/utils/quickLook'

const item = (over) => ({ kind: 'snippet', id: '1', name: '', tags: [], lang: '', ...over })

describe('scoreItem', () => {
  it('scores every item 0 for an empty query (order is preserved untouched)', () => {
    expect(scoreItem('', item({ name: 'anything' }))).toBe(0)
    expect(scoreItem('   ', item({ name: 'anything' }))).toBe(0)
  })

  it('ranks a name prefix above a name substring above a tag above a format', () => {
    expect(scoreItem('con', item({ name: 'config.json' }))).toBe(0)
    expect(scoreItem('fig', item({ name: 'config.json' }))).toBe(1)
    expect(scoreItem('prod', item({ name: 'nginx', tags: ['prod'] }))).toBe(2)
    expect(scoreItem('sql', item({ name: 'nginx', tags: ['prod'], lang: 'sql' }))).toBe(3)
  })

  it('is case-insensitive and trims the query', () => {
    expect(scoreItem('  CONFIG ', item({ name: 'config.json' }))).toBe(0)
  })

  it('returns NO_MATCH when nothing matches', () => {
    expect(scoreItem('zzz', item({ name: 'config', tags: ['prod'], lang: 'json' }))).toBe(NO_MATCH)
  })
})

describe('rank', () => {
  const items = [
    item({ id: 'a', name: 'app.config.json', tags: ['config'], lang: 'json' }),
    item({ id: 'b', kind: 'diff', name: 'config-v1 vs v2', tags: ['config'], lang: 'json' }),
    item({ id: 'c', name: 'nginx.conf', tags: ['config', 'prod'], lang: 'nginx' }),
    item({ id: 'd', name: 'cohort query', tags: ['sql'], lang: 'sql' })
  ]

  it('returns the full list in input order for an empty query', () => {
    expect(rank('', items).map((i) => i.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('drops non-matches and orders by score, keeping input order within a band', () => {
    // 'config' → b is a name PREFIX (band 0), a is a name substring (band 1),
    // c is a tag hit (band 2). d does not match at all.
    expect(rank('config', items).map((i) => i.id)).toEqual(['b', 'a', 'c'])
  })

  it('merges snippets and diffs into one ranked list', () => {
    const ids = rank('json', items).map((i) => i.id)
    expect(ids).toContain('a')
    expect(ids).toContain('b')
    expect(ids).not.toContain('d')
  })

  it('tolerates a null list', () => {
    expect(rank('x', null)).toEqual([])
  })
})

describe('snippetRows', () => {
  const languageOf = (e) => e.language ?? 'plaintext'
  const entries = [
    { id: 'a', name: 'older', createdAt: 1, language: 'sql' },
    { id: 'b', name: 'newer', createdAt: 2, tags: ['work'] }
  ]

  it('lists newest first without mutating the store array', () => {
    const before = entries.map((e) => e.id)
    expect(snippetRows(entries, languageOf).map((r) => r.id)).toEqual(['b', 'a'])
    expect(entries.map((e) => e.id)).toEqual(before)
  })

  it('blanks a plaintext language so the row shows no monogram', () => {
    const rows = snippetRows(entries, languageOf)
    expect(rows.find((r) => r.id === 'b').lang).toBe('')
    expect(rows.find((r) => r.id === 'a').lang).toBe('sql')
  })

  it('defaults tags to an array so a row never reads undefined', () => {
    expect(snippetRows(entries, languageOf).find((r) => r.id === 'a').tags).toEqual([])
  })
})

describe('resultRows', () => {
  const tools = [{ kind: 'command', id: 'base64', name: 'Base64' }]
  const snippets = [{ kind: 'snippet', id: 's1', name: 'deploy notes' }]
  const rows = (o) => resultRows({ query: '', tools, snippets, toolsOpen: false, ...o })

  it('offers no create row until something is typed', () => {
    expect(rows().some((r) => r.kind === 'create')).toBe(false)
  })

  it('ignores a query that is only whitespace', () => {
    expect(rows({ query: '   ' }).some((r) => r.kind === 'create')).toBe(false)
  })

  // Last, not first: the selection must stay on the best match, and Cmd+N is
  // the fast path from anywhere.
  it('puts the create row last, behind every match', () => {
    const out = rows({ query: 'deploy' })
    expect(out.at(-1)).toMatchObject({ kind: 'create', name: 'deploy' })
    expect(out.some((r) => r.kind === 'snippet')).toBe(true)
  })

  it('names the create row with the trimmed query', () => {
    expect(rows({ query: '  stuck orders  ' }).at(-1).name).toBe('stuck orders')
  })

  it('is the only row when nothing matches, so Enter creates', () => {
    const out = rows({ query: 'zzzz' })
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('create')
  })

  it('keeps the tools header collapsed until asked, then expands in place', () => {
    expect(rows().filter((r) => r.kind === 'command')).toHaveLength(0)
    const open = rows({ toolsOpen: true })
    expect(open[0]).toMatchObject({ kind: 'tools', count: 1 })
    expect(open[1].kind).toBe('command')
  })

  it('drops the tools header entirely when no tool matches', () => {
    expect(rows({ query: 'deploy' }).some((r) => r.kind === 'tools')).toBe(false)
  })
})

// utils/ is pure and cannot call t(): a label resolved at module load would
// freeze whatever locale the app started in. These tables hand back IDs.
describe('hint tables', () => {
  const ids = (rows) => rows.map(([, id]) => id)
  const isKey = (id) => id.startsWith('quickLook.hint.')

  it('previewHints returns message ids and keeps the given glyph', () => {
    const rows = previewHints('⇧⌘C')
    expect(ids(rows).every(isKey)).toBe(true)
    expect(rows.some(([glyph]) => glyph === '⇧⌘C')).toBe(true)
  })

  it('composeHints returns message ids', () => {
    expect(ids(composeHints('⌘↵')).every(isKey)).toBe(true)
  })

  it('listHints always advertises the new-snippet key', () => {
    const rows = listHints({ kind: 'snippet', toolsOpen: false, copyKey: '⌘C', newKey: '⌘N' })
    expect(ids(rows).every(isKey)).toBe(true)
    expect(rows).toContainEqual(['⌘N', 'quickLook.hint.newSnippet'])
  })

  it('listHints says "create" on the create row and "open" elsewhere', () => {
    const on = (kind) => ids(listHints({ kind, toolsOpen: false, copyKey: '⌘C', newKey: '⌘N' }))
    expect(on('create')).toContain('quickLook.hint.create')
    expect(on('snippet')).toContain('quickLook.hint.open')
  })

  it('listHints offers → only on a row that drills in', () => {
    const arrow = (kind) =>
      listHints({ kind, toolsOpen: false, copyKey: '⌘C', newKey: '⌘N' }).some(
        ([glyph]) => glyph === '→'
      )
    expect(arrow('snippet')).toBe(true)
    expect(arrow('tools')).toBe(true)
    expect(arrow('create')).toBe(false)
  })

  it('listHints reads ←/Esc as collapse only while the section is open', () => {
    const last = (toolsOpen) =>
      listHints({ kind: 'tools', toolsOpen, copyKey: '⌘C', newKey: '⌘N' }).at(-1)[1]
    expect(last(true)).toBe('quickLook.hint.collapse')
    expect(last(false)).toBe('quickLook.hint.close')
  })
})
