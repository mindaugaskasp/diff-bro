import { describe, expect, it } from 'vitest'
import {
  PREVIEW_H,
  PREVIEW_MIN,
  clampPreviewHeight,
  readPreviewHeight
} from '../../../src/renderer/src/utils/previewHeight'

describe('clampPreviewHeight', () => {
  it('keeps a height inside the bounds', () => {
    expect(clampPreviewHeight(300, 1000)).toBe(300)
  })

  it('never shrinks below the minimum', () => {
    expect(clampPreviewHeight(10, 1000)).toBe(PREVIEW_MIN)
  })

  it('leaves the editor at least 30% of the column', () => {
    expect(clampPreviewHeight(5000, 1000)).toBe(700)
  })

  it('falls back to the designed height on junk', () => {
    expect(clampPreviewHeight('tall', 1000)).toBe(PREVIEW_H)
  })
})

describe('readPreviewHeight', () => {
  it('reads a stored height', () => {
    expect(readPreviewHeight('{"height":320}')).toBe(320)
  })

  it('is the designed height when nothing or garbage is stored', () => {
    expect(readPreviewHeight(null)).toBe(PREVIEW_H)
    expect(readPreviewHeight('{not json')).toBe(PREVIEW_H)
  })
})
