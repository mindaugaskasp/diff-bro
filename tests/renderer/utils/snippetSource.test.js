import { describe, expect, it } from 'vitest'
import {
  DIFF_DRAG_TYPE,
  DRAG_TYPE,
  dragIdsFrom,
  snippetSource
} from '../../../src/renderer/src/utils/snippetSource'

const entry = (over = {}) => ({ id: 'e1', name: 'Deploy config', secret: false, ...over })

// A snippet becomes a side the diff view already understands — the same shape
// pasted text produces, so save/clear/export need no special case.
describe('snippetSource', () => {
  it('maps an entry and its content to a pathless side', () => {
    expect(snippetSource(entry(), '{"a":1}')).toEqual({
      path: null,
      name: 'Deploy config',
      content: '{"a":1}',
      snippetId: 'e1'
    })
  })

  // The mask exists so the plaintext is not on screen; a diff pane is the
  // largest screen there is.
  it('refuses a secret snippet', () => {
    expect(snippetSource(entry({ secret: true }), 'sk-live-DEADBEEF')).toBe(null)
  })

  it('refuses a missing entry or missing content', () => {
    expect(snippetSource(null, 'x')).toBe(null)
    expect(snippetSource(entry(), null)).toBe(null)
    expect(snippetSource(entry(), undefined)).toBe(null)
  })

  it('keeps empty content — an empty snippet is still comparable', () => {
    expect(snippetSource(entry(), '')).toMatchObject({ content: '', snippetId: 'e1' })
  })

  it('falls back to a name rather than an empty label', () => {
    expect(snippetSource(entry({ name: '' }), 'x').name).toBeTruthy()
    expect(snippetSource(entry({ name: undefined }), 'x').name).toBeTruthy()
  })
})

// The drag payload is the one thing here an attacker could author, so it is
// parsed defensively and only ever yields ids — never content.
describe('dragIdsFrom', () => {
  const transfer = (data, types) => ({
    types: types ?? [DRAG_TYPE],
    getData: () => data
  })

  it('reads the ids the drag carried', () => {
    expect(dragIdsFrom(transfer(JSON.stringify(['a', 'b'])))).toEqual(['a', 'b'])
  })

  it('is empty when the drag is not ours', () => {
    expect(dragIdsFrom(transfer('["a"]', ['Files']))).toEqual([])
    expect(dragIdsFrom(null)).toEqual([])
    expect(dragIdsFrom(undefined)).toEqual([])
  })

  it('survives a payload that is not the shape it claims', () => {
    expect(dragIdsFrom(transfer('not json'))).toEqual([])
    expect(dragIdsFrom(transfer('{"id":"a"}'))).toEqual([])
    expect(dragIdsFrom(transfer('[1,2,{}]'))).toEqual([])
    expect(dragIdsFrom(transfer(''))).toEqual([])
  })

  // Two sides is the most a comparison has; a crafted drag cannot make the app
  // decrypt an unbounded list.
  it('takes at most two ids and caps their length', () => {
    expect(dragIdsFrom(transfer(JSON.stringify(['a', 'b', 'c', 'd'])))).toEqual(['a', 'b'])
    expect(dragIdsFrom(transfer(JSON.stringify(['x'.repeat(500)])))).toEqual([])
  })
})

// A diff drags out of the sidebar too, and shares this parsing on purpose: the
// caps and shape checks ARE the hardening, and a second copy is how one of them
// ends up without them.
describe('dragIdsFrom — the diff flavour', () => {
  const diffTransfer = (data) => ({
    types: [DIFF_DRAG_TYPE],
    getData: (t) => (t === DIFF_DRAG_TYPE ? data : '')
  })

  it('reads ids off a diff drag', () => {
    expect(dragIdsFrom(diffTransfer(JSON.stringify(['d1'])), DIFF_DRAG_TYPE)).toEqual(['d1'])
  })

  it('ignores a snippet drag when asked for diffs, and the reverse', () => {
    expect(dragIdsFrom(diffTransfer(JSON.stringify(['d1'])))).toEqual([])
    const snippet = { types: [DRAG_TYPE], getData: () => JSON.stringify(['s1']) }
    expect(dragIdsFrom(snippet, DIFF_DRAG_TYPE)).toEqual([])
  })

  it('applies the same caps to both', () => {
    const many = JSON.stringify(['a', 'b', 'c', 'd'])
    expect(dragIdsFrom(diffTransfer(many), DIFF_DRAG_TYPE)).toHaveLength(2)
    expect(dragIdsFrom(diffTransfer('not json'), DIFF_DRAG_TYPE)).toEqual([])
  })
})
