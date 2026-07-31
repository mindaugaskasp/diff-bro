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
    expect(p.lineClass(1)).toEqual(['ql-pv-line', { hot: true }])
    expect(p.lineClass(0)).toEqual(['ql-pv-line', { hot: false }])
    zone.value = 'list'
    expect(p.lineClass(1)).toEqual(['ql-pv-line', { hot: false }])
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
