import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useWindowFileDrop } from '../../../src/renderer/src/composables/useFileDrop'
import { DIFF_DRAG_TYPE, DRAG_TYPE } from '../../../src/renderer/src/utils/snippetSource'
import { openSavedDiff } from '../../../src/renderer/src/composables/useSavedDiffOpen'

vi.mock('../../../src/renderer/src/composables/useSavedDiffOpen', () => ({
  openSavedDiff: vi.fn()
}))
vi.mock('../../../src/renderer/src/i18n', () => ({ t: (k) => k }))

const store = () => ({ dropSnippets: vi.fn(), dropFiles: vi.fn() })

// `target.closest(sel)` is all the composable asks of the DOM.
const targetIn = (region) => ({
  closest: (sel) => (sel.includes('drop-region') ? (region ? {} : null) : null)
})

const snippetDrop = (region) => ({
  dataTransfer: {
    types: [DRAG_TYPE],
    getData: () => JSON.stringify(['snip-1'])
  },
  target: targetIn(region)
})

describe('useWindowFileDrop — where a snippet may be dropped', () => {
  // The handler is bound to the whole window, so releasing a snippet over the
  // sidebar — or letting go of a drag that never really started — replaced the
  // on-screen comparison. A snippet BECOMES a comparison, so it has to be
  // released on the thing it will be compared in.
  it('ignores a snippet released outside the comparison column', async () => {
    const s = store()
    const drop = useWindowFileDrop(s, ref(false))
    await drop.onDrop(snippetDrop(false))
    expect(s.dropSnippets).not.toHaveBeenCalled()
  })

  it('accepts one released inside it', async () => {
    const s = store()
    const drop = useWindowFileDrop(s, ref(false))
    await drop.onDrop(snippetDrop(true))
    expect(s.dropSnippets).toHaveBeenCalledWith(['snip-1'], null)
  })

  it('clears the overlay either way, so nothing is left lit', async () => {
    const drop = useWindowFileDrop(store(), ref(false))
    // Light it FIRST: asserting false on something already false proved only
    // that the composable had not turned it on.
    drop.onDragEnter(snippetDrop(true))
    drop.onDragOver(snippetDrop(true))
    expect(drop.active.value).toBe(true)
    await drop.onDrop(snippetDrop(false))
    expect(drop.active.value).toBe(false)
    expect(drop.needsDiffRegion.value).toBe(false)
  })

  it('still refuses everything while a dialog owns drops', async () => {
    const s = store()
    const drop = useWindowFileDrop(s, ref(true))
    await drop.onDrop(snippetDrop(true))
    expect(s.dropSnippets).not.toHaveBeenCalled()
  })
})

// Gating dragENTER was wrong twice over: every snippet drag starts in the
// sidebar, so the enter never fired, while dragleave still decremented — the
// depth counter went unbalanced and the overlay could never latch on. Where the
// pointer IS belongs to dragover, which fires continuously.
describe('useWindowFileDrop — the overlay follows the pointer', () => {
  const fileDrag = (region) => ({ dataTransfer: { types: ['Files'] }, target: targetIn(region) })

  it('lights up once a snippet reaches the comparison column', () => {
    const drop = useWindowFileDrop(store(), ref(false))
    drop.onDragEnter(snippetDrop(false)) // entering over the sidebar
    expect(drop.active.value).toBe(false)
    drop.onDragOver(snippetDrop(true)) // now over the pane
    expect(drop.active.value).toBe(true)
    expect(drop.needsDiffRegion.value).toBe(true)
  })

  it('goes dark again when the snippet leaves the column', () => {
    const drop = useWindowFileDrop(store(), ref(false))
    drop.onDragEnter(snippetDrop(false))
    drop.onDragOver(snippetDrop(true))
    drop.onDragOver(snippetDrop(false))
    expect(drop.active.value).toBe(false)
  })

  it('keeps the depth counter balanced, so a second drag still works', () => {
    const drop = useWindowFileDrop(store(), ref(false))
    for (const pass of [1, 2]) {
      drop.onDragEnter(snippetDrop(false))
      drop.onDragOver(snippetDrop(true))
      expect(drop.active.value, `pass ${pass}`).toBe(true)
      drop.onDragLeave()
      expect(drop.active.value, `pass ${pass} after leave`).toBe(false)
    }
  })

  // Files are a different gesture: dropping one on the app has always meant
  // "compare this", wherever it lands.
  it('lights up for a file anywhere in the window', () => {
    const drop = useWindowFileDrop(store(), ref(false))
    drop.onDragEnter(fileDrag(false))
    expect(drop.active.value).toBe(true)
    expect(drop.needsDiffRegion.value).toBe(false)
  })
})

// Escape cancels a drag. Chromium then fires dragend on the SOURCE and NOTHING
// else — no dragleave, no drop — so every reset path hanging off those two left
// the wash and the drop card on screen until the user dragged something again.
describe('useWindowFileDrop — a cancelled drag', () => {
  it('clears the overlay on dragend', () => {
    const drop = useWindowFileDrop(store(), ref(false))
    drop.onDragEnter(snippetDrop(true))
    drop.onDragOver(snippetDrop(true))
    expect(drop.active.value).toBe(true)
    drop.onDragEnd()
    expect(drop.active.value).toBe(false)
    expect(drop.needsDiffRegion.value).toBe(false)
  })

  it('clears it however deeply nested the drag had gone', () => {
    const drop = useWindowFileDrop(store(), ref(false))
    drop.onDragEnter(snippetDrop(true))
    drop.onDragEnter(snippetDrop(true))
    drop.onDragEnter(snippetDrop(true))
    drop.onDragEnd()
    expect(drop.active.value).toBe(false)
  })
})

// The row click explains an expired or undecryptable diff; the drop is the same
// action by another gesture, so it cannot fail in silence.
describe('useWindowFileDrop — a saved diff that will not open', () => {
  const diffDrop = () => ({
    dataTransfer: {
      types: [DIFF_DRAG_TYPE],
      getData: () => JSON.stringify(['gone-1'])
    },
    target: targetIn(true)
  })

  it('says so, exactly as clicking the row does', async () => {
    openSavedDiff.mockResolvedValue(false)
    const s = { ...store(), showNotice: vi.fn() }
    await useWindowFileDrop(s, ref(false)).onDrop(diffDrop())
    expect(s.showNotice).toHaveBeenCalledWith('savedDiffRow.expiredOrUndecryptable')
  })

  it('stays quiet when it opens', async () => {
    openSavedDiff.mockResolvedValue(true)
    const s = { ...store(), showNotice: vi.fn() }
    await useWindowFileDrop(s, ref(false)).onDrop(diffDrop())
    expect(s.showNotice).not.toHaveBeenCalled()
  })
})
