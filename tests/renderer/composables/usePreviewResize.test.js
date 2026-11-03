import { beforeEach, describe, expect, it } from 'vitest'
import { usePreviewResize } from '../../../src/renderer/src/composables/usePreviewResize'
import { PREVIEW_H } from '../../../src/renderer/src/utils/previewHeight'

const stored = () => JSON.parse(localStorage.getItem('diffbro.mermaidPreview') ?? '{}')
const move = (y) => window.dispatchEvent(new window.PointerEvent('pointermove', { clientY: y }))
const space = () => 1000

beforeEach(() => {
  localStorage.clear()
  window.api = {}
})

describe('usePreviewResize', () => {
  it('starts at the designed height', () => {
    expect(usePreviewResize(space).height.value).toBe(PREVIEW_H)
  })

  // The grip is on the TOP edge, so dragging up grows the preview.
  it('grows as the grip moves up and shrinks as it moves down', () => {
    const r = usePreviewResize(space)
    r.start({ clientY: 600 })
    move(500)
    expect(r.height.value).toBe(PREVIEW_H + 100)
    move(640)
    expect(r.height.value).toBe(PREVIEW_H - 40)
    r.end()
  })

  it('stops where the editor would lose its share', () => {
    const r = usePreviewResize(space)
    r.start({ clientY: 900 })
    move(0)
    expect(r.height.value).toBe(700)
    r.end()
  })

  it('remembers the height on release', () => {
    const r = usePreviewResize(space)
    r.start({ clientY: 600 })
    move(500)
    expect(stored().height).toBeUndefined()
    window.dispatchEvent(new window.PointerEvent('pointerup'))
    expect(stored().height).toBe(PREVIEW_H + 100)
  })

  it('a reset puts the designed height back', () => {
    const r = usePreviewResize(space)
    r.start({ clientY: 600 })
    move(400)
    r.end()
    r.reset()
    expect(r.height.value).toBe(PREVIEW_H)
    expect(stored().height).toBe(PREVIEW_H)
  })
})
