import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeEditor } from './fakeEditor'
import {
  remember,
  repaint,
  resolveTouched,
  reveal,
  seedRegions,
  syncScroll,
  takeFromGutter,
  writeChoice
} from '../../../../src/renderer/src/features/merge/mergePaneOps'

const RAW = `head\n<<<<<<< HEAD\nreplicas: 5\n=======\nreplicas: 9\n>>>>>>> feature\ntail\n`

function scene() {
  const merge = {
    at: 0,
    ours: 'head\nreplicas: 5\ntail\n',
    theirs: 'head\nreplicas: 9\ntail\n',
    rawContent: RAW,
    result: 'head\nreplicas: 5\ntail\n',
    regions: [{ ours: ['replicas: 5'], theirs: ['replicas: 9'], resolved: false }],
    markResolved(i) {
      this.regions[i].resolved = true
    }
  }
  const editors = {
    ours: fakeEditor(merge.ours),
    result: fakeEditor(merge.result),
    theirs: fakeEditor(merge.theirs)
  }
  const ids = {}
  const settled = []
  seedRegions({ editors, merge, ids, settled })
  return { merge, editors, ids, settled, anchors: { ours: [], theirs: [] } }
}

describe('seedRegions', () => {
  it('puts the region where our side left it, and remembers how it reads', () => {
    const { ids, settled, editors } = scene()
    expect(ids.result).toHaveLength(1)
    expect(editors.result.getModel().getDecorationRange(ids.result[0]).startLineNumber).toBe(2)
    expect(settled).toHaveLength(1)
  })
})

describe('repaint', () => {
  let s
  beforeEach(() => (s = scene()))

  it('bands the region in all three panes and finds it in both sides', () => {
    repaint(s)
    expect(s.anchors.ours[0]).toEqual({ line: 2, count: 1 })
    expect(s.anchors.theirs[0]).toEqual({ line: 2, count: 1 })
    expect(s.ids.ours).toHaveLength(2)
  })

  it('does nothing at all before the editors exist', () => {
    expect(() => repaint({ ...s, editors: { result: null } })).not.toThrow()
  })
})

describe('writeChoice', () => {
  it('puts the chosen side in the result and marks the region settled', () => {
    const s = scene()
    writeChoice({ ...s, index: 0, choice: 'theirs' })
    expect(s.editors.result.__lines()).toEqual(['head', 'replicas: 9', 'tail', ''])
    expect(s.merge.regions[0].resolved).toBe(true)
  })

  // An answer that is not one of the four writes nothing rather than emptying
  // the region — this is the file git is about to be handed.
  it('writes nothing for an answer it does not know', () => {
    const s = scene()
    writeChoice({ ...s, index: 0, choice: 'sideways' })
    expect(s.editors.result.executeEdits).not.toHaveBeenCalled()
    expect(s.merge.regions[0].resolved).toBe(false)
  })

  it('ignores an index that has no region', () => {
    const s = scene()
    writeChoice({ ...s, index: 9, choice: 'ours' })
    expect(s.editors.result.executeEdits).not.toHaveBeenCalled()
  })
})

// The case the old resolver could not express: the answer neither side had.
describe('resolveTouched', () => {
  it('counts a hand edit inside a region as the answer to it', () => {
    const s = scene()
    s.editors.result.setValue('head\nreplicas: 7\ntail\n')
    resolveTouched(s)
    expect(s.merge.regions[0].resolved).toBe(true)
  })

  it('leaves a region alone when the edit landed outside it', () => {
    const s = scene()
    s.editors.result.setValue('HEAD\nreplicas: 5\ntail\n')
    resolveTouched(s)
    expect(s.merge.regions[0].resolved).toBe(false)
  })

  it('stands down when there is no editor', () => {
    expect(() => resolveTouched({ editors: {}, merge: {}, ids: {}, settled: [] })).not.toThrow()
    expect(() => remember({ editors: {}, ids: {}, settled: [] })).not.toThrow()
  })
})

describe('takeFromGutter', () => {
  const anchors = { ours: [{ line: 2, count: 1 }] }
  const glyph = (lineNumber) => ({
    target: { type: 2, position: { lineNumber } }
  })

  it('answers the region the click sits on', () => {
    const take = vi.fn()
    takeFromGutter({ anchors, key: 'ours', event: glyph(2), take })
    expect(take).toHaveBeenCalledWith(0, 'ours')
  })

  it('ignores a click on a line no region covers, and one outside the margin', () => {
    const take = vi.fn()
    takeFromGutter({ anchors, key: 'ours', event: glyph(9), take })
    takeFromGutter({ anchors, key: 'ours', event: { target: { type: 6 } }, take })
    expect(take).not.toHaveBeenCalled()
  })
})

describe('syncScroll', () => {
  it('moves the other two panes and does not echo back', () => {
    const s = scene()
    const sync = { busy: false }
    syncScroll(s.editors, 'result', sync)
    expect(s.editors.ours.setScrollTop).toHaveBeenCalledWith(120)
    expect(s.editors.theirs.setScrollTop).toHaveBeenCalledWith(120)
    syncScroll(s.editors, 'result', { busy: true })
    expect(s.editors.ours.setScrollTop).toHaveBeenCalledTimes(1)
    expect(() => syncScroll(s.editors, 'nowhere', sync)).not.toThrow()
  })
})

describe('reveal', () => {
  it('brings the region into view and puts the caret on it', () => {
    const s = scene()
    reveal({ editors: s.editors, ids: s.ids, index: 0 })
    expect(s.editors.result.revealLineInCenter).toHaveBeenCalledWith(2)
    expect(s.editors.result.focus).toHaveBeenCalled()
  })

  it('does nothing for a region that is not there', () => {
    const s = scene()
    reveal({ editors: s.editors, ids: s.ids, index: 4 })
    expect(s.editors.result.revealLineInCenter).not.toHaveBeenCalled()
  })
})

// A conflict where OUR side deleted the lines is an INSERTION POINT, not a
// one-line region — and the two produced the same Monaco range, so taking
// theirs replaced the first stable line after the conflict with it. The line
// was gone from the file git was then handed.
describe('a region one side emptied', () => {
  const RAW_EMPTY = `head\n<<<<<<< HEAD\n=======\nthey added this\n>>>>>>> feature\ntail\n`

  function emptyScene() {
    const merge = {
      at: 0,
      ours: 'head\ntail\n',
      theirs: 'head\nthey added this\ntail\n',
      rawContent: RAW_EMPTY,
      result: 'head\ntail\n',
      regions: [{ ours: [], theirs: ['they added this'], resolved: false }],
      markResolved(i) {
        this.regions[i].resolved = true
      }
    }
    const editors = {
      ours: fakeEditor(merge.ours),
      result: fakeEditor(merge.result),
      theirs: fakeEditor(merge.theirs)
    }
    const ids = {}
    const settled = []
    seedRegions({ editors, merge, ids, settled })
    return { merge, editors, ids, settled, anchors: { ours: [], theirs: [] } }
  }

  it('inserts their side instead of overwriting the line after it', () => {
    const s = emptyScene()
    writeChoice({ ...s, index: 0, choice: 'theirs' })
    expect(s.editors.result.__lines()).toEqual(['head', 'they added this', 'tail', ''])
  })

  // Answered once, it is no longer an insertion point: taking the other side
  // must REPLACE what the first answer wrote, not sit beside it.
  it('replaces its own first answer when the reader changes their mind', () => {
    const s = emptyScene()
    writeChoice({ ...s, index: 0, choice: 'theirs' })
    writeChoice({ ...s, index: 0, choice: 'ours' })
    expect(s.editors.result.__lines()).toEqual(['head', 'tail', ''])
  })
})
