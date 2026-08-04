import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { usePreviewLines } from '../../../src/renderer/src/composables/usePreviewLines'

function setup({ text = 'a\nb\nc', zoneStart = 'preview', current = { kind: 'snippet' } } = {}) {
  const snippetText = ref(text)
  const zone = ref(zoneStart)
  const previewEl = ref(null)
  const cur = ref(current)
  const onCopied = vi.fn()
  const p = usePreviewLines({ snippetText, zone, previewEl, current: cur, onCopied })
  return { p, snippetText, zone, previewEl, cur, onCopied }
}

describe('usePreviewLines', () => {
  beforeEach(() => {
    window.api = { copyText: vi.fn().mockResolvedValue({ ok: true }) }
  })

  it('movePreview steps the active line and clamps at both ends', () => {
    const { p } = setup({ text: 'a\nb\nc' })
    expect(p.previewLine.value).toBe(0)
    p.movePreview(1)
    p.movePreview(1)
    expect(p.previewLine.value).toBe(2)
    p.movePreview(1) // clamp at the last line
    expect(p.previewLine.value).toBe(2)
    p.movePreview(-1)
    p.movePreview(-1)
    p.movePreview(-1) // clamp at 0
    expect(p.previewLine.value).toBe(0)
  })

  it('movePreview scrolls the container by the overflow so the active line stays visible', () => {
    const { p, previewEl } = setup()
    previewEl.value = {
      scrollTop: 0,
      getBoundingClientRect: () => ({ top: 0, bottom: 100 }),
      children: [
        { getBoundingClientRect: () => ({ top: 0, bottom: 20 }) },
        { getBoundingClientRect: () => ({ top: 90, bottom: 110 }) }, // juts 10px below
        { getBoundingClientRect: () => ({ top: 110, bottom: 130 }) }
      ]
    }
    p.movePreview(1)
    expect(previewEl.value.scrollTop).toBe(10)
  })

  it('lineClass marks only the active line, and only in the preview zone', () => {
    const { p, zone } = setup({ zoneStart: 'preview' })
    p.movePreview(1)
    expect(p.lineClass(1)).toEqual(['ql-pv-line', { hot: true, cursor: true }])
    expect(p.lineClass(0)).toEqual(['ql-pv-line', { hot: false, cursor: false }])
    zone.value = 'list'
    expect(p.lineClass(1)).toEqual(['ql-pv-line', { hot: false, cursor: false }])
  })

  it('hoverLine sets the active line from the hovered row index', () => {
    const { p } = setup()
    const children = [{}, {}, {}]
    children[2].parentElement = { children }
    p.hoverLine({ target: { closest: () => children[2] } })
    expect(p.previewLine.value).toBe(2)
  })

  it('copyLine copies the active line and reports it', async () => {
    const { p, onCopied } = setup({ text: 'first\nsecond\nthird' })
    p.movePreview(1)
    await p.copyLine()
    expect(window.api.copyText).toHaveBeenCalledWith('second')
    expect(onCopied).toHaveBeenCalledWith('line 2')
  })

  it('copyLine is a no-op for a non-snippet selection', async () => {
    const { p, onCopied } = setup({ current: { kind: 'diff' } })
    await p.copyLine()
    expect(window.api.copyText).not.toHaveBeenCalled()
    expect(onCopied).not.toHaveBeenCalled()
  })
})

// Shift+Arrow selects a span, the way an editor does, so a reader can take a few
// lines out of a snippet instead of the whole thing.
describe('Shift+Arrow line range', () => {
  beforeEach(() => {
    window.api = { copyText: vi.fn().mockResolvedValue({ ok: true }) }
  })

  it('is a single line until Shift is used', () => {
    const { p } = setup({ text: 'a\nb\nc\nd' })
    expect(p.range.value).toEqual({ start: 0, end: 0 })
    p.movePreview(1)
    expect(p.range.value).toEqual({ start: 1, end: 1 })
  })

  it('grows downward from where Shift was first pressed', () => {
    const { p } = setup({ text: 'a\nb\nc\nd' })
    p.movePreview(1) // on line 2
    p.movePreview(1, true)
    p.movePreview(1, true)
    expect(p.range.value).toEqual({ start: 1, end: 3 })
    expect(p.previewLine.value).toBe(3)
  })

  it('grows upward too, keeping the anchor below', () => {
    const { p } = setup({ text: 'a\nb\nc\nd' })
    p.movePreview(1)
    p.movePreview(1)
    p.movePreview(-1, true)
    expect(p.range.value).toEqual({ start: 1, end: 2 })
  })

  it('shrinks back through the anchor and past it', () => {
    const { p } = setup({ text: 'a\nb\nc\nd' })
    p.movePreview(1, true)
    p.movePreview(1, true)
    expect(p.range.value).toEqual({ start: 0, end: 2 })
    p.movePreview(-1, true)
    expect(p.range.value).toEqual({ start: 0, end: 1 })
  })

  it('a plain arrow collapses the range', () => {
    const { p } = setup({ text: 'a\nb\nc\nd' })
    p.movePreview(1, true)
    p.movePreview(1, true)
    p.movePreview(1)
    expect(p.range.value).toEqual({ start: 3, end: 3 })
  })

  // The regression this guards: hover fired on any pointer drift and wiped a
  // deliberate keyboard selection.
  it('mouse movement does not disturb an active range', () => {
    const { p } = setup({ text: 'a\nb\nc\nd' })
    p.movePreview(1, true)
    p.movePreview(1, true)
    expect(p.range.value).toEqual({ start: 0, end: 2 })

    const parent = { children: [] }
    const line = { parentElement: parent, closest: () => line }
    parent.children = [line, {}, {}, {}]
    p.hoverLine({ target: line })

    expect(p.range.value).toEqual({ start: 0, end: 2 })
    expect(p.previewLine.value).toBe(2)
  })

  it('hover still picks the line once the range is collapsed', () => {
    const { p } = setup({ text: 'a\nb\nc\nd' })
    p.movePreview(1, true)
    p.movePreview(-1) // a plain arrow collapses it
    const parent = { children: [] }
    const third = { parentElement: parent, closest: () => third }
    parent.children = [{}, {}, third, {}]
    p.hoverLine({ target: third })
    expect(p.range.value).toEqual({ start: 2, end: 2 })
  })

  it('clamps at the ends while extending', () => {
    const { p } = setup({ text: 'a\nb' })
    p.movePreview(1, true)
    p.movePreview(1, true)
    expect(p.range.value).toEqual({ start: 0, end: 1 })
    p.movePreview(-1, true)
    p.movePreview(-1, true)
    expect(p.range.value).toEqual({ start: 0, end: 0 })
  })
})

describe('copying a range', () => {
  beforeEach(() => {
    window.api = { copyText: vi.fn().mockResolvedValue({ ok: true }) }
  })

  it('copies every selected line, joined, and names the span', async () => {
    const { p, onCopied } = setup({ text: 'a\nb\nc\nd' })
    p.movePreview(1)
    p.movePreview(1, true)
    await p.copyLine()
    expect(window.api.copyText).toHaveBeenCalledWith('b\nc')
    expect(onCopied).toHaveBeenCalledWith('lines 2–3')
  })

  it('still says "line N" for a single line', async () => {
    const { p, onCopied } = setup({ text: 'a\nb\nc' })
    p.movePreview(1)
    await p.copyLine()
    expect(window.api.copyText).toHaveBeenCalledWith('b')
    expect(onCopied).toHaveBeenCalledWith('line 2')
  })

  it('copies an upward range in document order, not selection order', async () => {
    const { p } = setup({ text: 'a\nb\nc\nd' })
    p.movePreview(1)
    p.movePreview(1)
    p.movePreview(-1, true)
    await p.copyLine()
    expect(window.api.copyText).toHaveBeenCalledWith('b\nc')
  })

  it('copies nothing for a non-snippet result', async () => {
    const { p } = setup({ current: { kind: 'tools' } })
    p.movePreview(1, true)
    await p.copyLine()
    expect(window.api.copyText).not.toHaveBeenCalled()
  })
})

describe('lineClass', () => {
  it('marks every line of the range hot, and the moving one as the cursor', () => {
    const { p } = setup({ text: 'a\nb\nc\nd' })
    p.movePreview(1)
    p.movePreview(1, true)
    expect(p.lineClass(0)[1]).toEqual({ hot: false, cursor: false })
    expect(p.lineClass(1)[1]).toEqual({ hot: true, cursor: false })
    expect(p.lineClass(2)[1]).toEqual({ hot: true, cursor: true })
  })

  it('marks nothing while the list zone has focus', () => {
    const { p, zone } = setup({ text: 'a\nb' })
    p.movePreview(1, true)
    zone.value = 'list'
    expect(p.lineClass(0)[1]).toEqual({ hot: false, cursor: false })
  })
})
