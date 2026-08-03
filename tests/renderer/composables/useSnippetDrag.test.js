import { describe, expect, it, vi } from 'vitest'
import { useSnippetDrag } from '../../../src/renderer/src/composables/useSnippetDrag'
import { DRAG_TYPE } from '../../../src/renderer/src/utils/snippetSource'

// A DataTransfer stand-in that records what was set, so the test can assert what
// actually travels rather than that a method was called.
function transfer(initial = {}) {
  const data = { ...initial }
  return {
    // A getter, not a snapshot: the real DataTransfer.types reflects setData,
    // and a frozen copy would let a broken payload pass.
    get types() {
      return Object.keys(data)
    },
    effectAllowed: null,
    setData: (type, value) => {
      data[type] = value
    },
    getData: (type) => data[type] ?? '',
    setDragImage: vi.fn(),
    _data: data
  }
}

describe('useSnippetDrag — starting a drag', () => {
  it('puts only the id on the drag, never the content', () => {
    const { startDrag } = useSnippetDrag()
    const dt = transfer()
    startDrag({ dataTransfer: dt }, { id: 'e1', name: 'Deploy config', secret: false })

    expect(JSON.parse(dt._data[DRAG_TYPE])).toEqual(['e1'])
    // The whole payload, checked as one string: nothing may carry the body.
    expect(JSON.stringify(dt._data)).not.toContain('Deploy config')
  })

  it('refuses to start a drag for a secret snippet', () => {
    const { startDrag } = useSnippetDrag()
    const dt = transfer()
    const e = { dataTransfer: dt, preventDefault: vi.fn() }
    startDrag(e, { id: 's1', name: 'Prod API key', secret: true })

    expect(dt._data[DRAG_TYPE]).toBeUndefined()
    expect(e.preventDefault).toHaveBeenCalled()
  })

  it('survives a drag event with no dataTransfer', () => {
    const { startDrag } = useSnippetDrag()
    expect(() => startDrag({}, { id: 'e1', name: 'x' })).not.toThrow()
  })
})

describe('useSnippetDrag — recognising a drop', () => {
  const { snippetIdsIn, isSnippetDrag } = useSnippetDrag()

  it('reads the ids back out of a drag it started', () => {
    const { startDrag } = useSnippetDrag()
    const dt = transfer()
    startDrag({ dataTransfer: dt }, { id: 'e1', name: 'x' })
    expect(snippetIdsIn(dt)).toEqual(['e1'])
    expect(isSnippetDrag(dt)).toBe(true)
  })

  it('ignores a file drag and an empty one', () => {
    expect(isSnippetDrag(transfer({ Files: '' }))).toBe(false)
    expect(snippetIdsIn(transfer({ Files: '' }))).toEqual([])
    expect(isSnippetDrag(null)).toBe(false)
    expect(snippetIdsIn(undefined)).toEqual([])
  })

  // A drag from outside the app can claim our type and say anything.
  it('does not trust a hand-crafted payload', () => {
    expect(snippetIdsIn(transfer({ [DRAG_TYPE]: 'not json' }))).toEqual([])
    expect(snippetIdsIn(transfer({ [DRAG_TYPE]: '{"id":"a"}' }))).toEqual([])
    expect(snippetIdsIn(transfer({ [DRAG_TYPE]: JSON.stringify(['a', 'b', 'c']) }))).toEqual([
      'a',
      'b'
    ])
  })
})

// During dragenter/dragover the drag data store is in PROTECTED mode: `types`
// is readable but getData() returns "". A guard that reads the payload therefore
// never fires on a real drag — and a synthetic DataTransfer in a test would not
// show it, because synthetic events are not protected.
describe('useSnippetDrag — the dragenter guard', () => {
  const { isSnippetDragType } = useSnippetDrag()

  it('recognises a snippet drag from the types alone', () => {
    const protectedTransfer = {
      types: [DRAG_TYPE],
      getData: () => {
        throw new Error('getData must not be called during dragenter')
      }
    }
    expect(isSnippetDragType(protectedTransfer)).toBe(true)
  })

  it('is false for a file drag and for nothing', () => {
    expect(isSnippetDragType({ types: ['Files'], getData: () => '' })).toBe(false)
    expect(isSnippetDragType(null)).toBe(false)
  })
})
