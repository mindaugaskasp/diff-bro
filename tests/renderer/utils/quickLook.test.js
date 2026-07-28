import { describe, expect, it } from 'vitest'
import { rank, scoreItem, NO_MATCH } from '../../../src/renderer/src/utils/quickLook'

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
