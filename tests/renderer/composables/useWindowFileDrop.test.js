import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useWindowFileDrop } from '../../../src/renderer/src/composables/useFileDrop'
import { DRAG_TYPE } from '../../../src/renderer/src/utils/snippetSource'

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
    drop.onDragEnter(snippetDrop(false))
    await drop.onDrop(snippetDrop(false))
    expect(drop.active.value).toBe(false)
    expect(drop.snippetDrag.value).toBe(false)
  })

  it('still refuses everything while a dialog owns drops', async () => {
    const s = store()
    const drop = useWindowFileDrop(s, ref(true))
    await drop.onDrop(snippetDrop(true))
    expect(s.dropSnippets).not.toHaveBeenCalled()
  })
})
