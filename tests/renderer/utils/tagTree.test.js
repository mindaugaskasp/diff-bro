import { describe, expect, it } from 'vitest'
import {
  MAX_TAG_DEPTH,
  buildTagTree,
  isTagTooDeep,
  scopeOptions,
  tagPath
} from '../../../src/renderer/src/utils/tagTree'

const item = (id, tags = [], favorite = false) => ({ id, tags, favorite })
const ids = (list) => list.map((i) => i.id)

describe('tagPath', () => {
  it('splits a written path and drops empty or padded parts', () => {
    expect(tagPath('ops/k8s/prod')).toEqual(['ops', 'k8s', 'prod'])
    expect(tagPath(' ops / k8s/ ')).toEqual(['ops', 'k8s'])
  })
})

describe('isTagTooDeep', () => {
  it('allows three levels and refuses a fourth', () => {
    expect(MAX_TAG_DEPTH).toBe(3)
    expect(isTagTooDeep('ops/k8s/prod')).toBe(false)
    expect(isTagTooDeep('ops/k8s/prod/eu')).toBe(true)
  })
})

describe('buildTagTree', () => {
  const items = [
    item('restart', ['ops/k8s/prod']),
    item('tail', ['ops/k8s']),
    item('vacuum', ['data/prod', 'ops/k8s/prod']),
    item('loose'),
    item('star', ['ops'], true)
  ]
  const tree = buildTagTree(items)

  it('nests sections by path, in name order', () => {
    expect(tree.sections.map((s) => s.label)).toEqual(['data', 'ops'])
    const ops = tree.sections[1]
    expect(ops.children.map((s) => s.path)).toEqual(['ops/k8s'])
    expect(ops.children[0].children.map((s) => s.path)).toEqual(['ops/k8s/prod'])
  })

  it('lists an item under every tag it carries', () => {
    const prod = tree.sections[1].children[0].children[0]
    expect(ids(prod.items)).toEqual(['restart', 'vacuum'])
    expect(ids(tree.sections[0].children[0].items)).toEqual(['vacuum'])
  })

  it('counts everything inside a section once, whatever depth it sits at', () => {
    const [data, ops] = tree.sections
    expect(data.count).toBe(1)
    expect(ops.count).toBe(3)
    expect(ops.children[0].count).toBe(3)
  })

  it('keeps starred items in Favourites only, and untagged ones in Untagged', () => {
    expect(ids(tree.favorites)).toEqual(['star'])
    expect(ids(tree.untagged)).toEqual(['loose'])
    expect(tree.sections[1].items).toEqual([])
  })

  // Scoped by the # chip, only that branch shows: an item tagged elsewhere too
  // is listed once, under the tag inside the scope.
  it('shows only the scoped branch, the way down to it included', () => {
    const scoped = buildTagTree(items, { within: 'ops/k8s' })
    expect(scoped.sections.map((n) => n.path)).toEqual(['ops'])
    const k8s = scoped.sections[0].children[0]
    expect(k8s.path).toBe('ops/k8s')
    expect(ids(k8s.items)).toEqual(['tail'])
    expect(ids(k8s.children[0].items)).toEqual(['restart', 'vacuum'])
    expect(scoped.untagged).toEqual([])
  })

  // A snippet's automatic format tag (sql, mermaid…) is not one of the user's:
  // it stays findable but does not make a section or a second row.
  it('places an item only by the tags tagsOf gives it', () => {
    const notFormat = (e) => e.tags.filter((t) => t !== e.lang)
    const tree = buildTagTree(
      [
        { id: 'q', tags: ['ops', 'sql'], lang: 'sql' },
        { id: 'm', tags: ['mermaid'], lang: 'mermaid' }
      ],
      { tagsOf: notFormat }
    )
    expect(tree.sections.map((n) => n.path)).toEqual(['ops'])
    expect(ids(tree.untagged)).toEqual(['m'])
  })

  it('places a tag deeper than three levels at its third', () => {
    const deep = buildTagTree([item('deep', ['a/b/c/d'])])
    const c = deep.sections[0].children[0].children[0]
    expect(c.path).toBe('a/b/c')
    expect(c.children).toEqual([])
    expect(ids(c.items)).toEqual(['deep'])
  })
})

// `#` in the search box: every path a scope could be, including the parents no
// item carries on its own, filtered by what follows the `#`.
describe('scopeOptions', () => {
  const tags = ['ops/k8s/prod', 'ops/nginx', 'data/prod']

  it('offers every tag and every parent of one, in path order', () => {
    expect(scopeOptions(tags, '')).toEqual([
      'data',
      'data/prod',
      'ops',
      'ops/k8s',
      'ops/k8s/prod',
      'ops/nginx'
    ])
  })

  it('narrows to the paths containing what was typed', () => {
    expect(scopeOptions(tags, 'k8')).toEqual(['ops/k8s', 'ops/k8s/prod'])
    expect(scopeOptions(tags, 'PROD')).toEqual(['data/prod', 'ops/k8s/prod'])
  })
})
