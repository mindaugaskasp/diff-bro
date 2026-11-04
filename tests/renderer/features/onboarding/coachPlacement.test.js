import { describe, expect, it } from 'vitest'
import {
  COACH_W,
  coachPlacement
} from '../../../../src/renderer/src/features/onboarding/coachPlacement'

const stage = { w: 1280, h: 720 }

describe('coachPlacement', () => {
  it('sits under a target near the right edge, with the pointer on its centre', () => {
    const rect = { x: 1180, y: 40, w: 70, h: 26 }
    const at = coachPlacement({ rect, side: 'bottom', height: 140, stage })
    expect(at.pointer).toBe('up')
    expect(at.left + COACH_W).toBeLessThanOrEqual(stage.w - 8)
    expect(at.top).toBeGreaterThan(rect.y + rect.h)
    expect(at.left + at.offset).toBe(rect.x + rect.w / 2)
  })

  it('sits to the right of a target, pointing left at its middle', () => {
    const rect = { x: 12, y: 90, w: 230, h: 30 }
    const at = coachPlacement({ rect, side: 'right', height: 140, stage })
    expect(at.pointer).toBe('left')
    expect(at.left).toBeGreaterThan(rect.x + rect.w)
    expect(at.top + at.offset).toBe(rect.y + rect.h / 2)
  })

  it('stays inside the window when the target hugs the top', () => {
    const at = coachPlacement({
      rect: { x: 0, y: 0, w: 20, h: 4 },
      side: 'right',
      height: 140,
      stage
    })
    expect(at.top).toBe(8)
    expect(at.offset).toBeGreaterThanOrEqual(18)
  })

  it('sits inside a wide target, beside its first line, pointing left', () => {
    const rect = { x: 300, y: 80, w: 960, h: 600 }
    const at = coachPlacement({ rect, side: 'inside', height: 140, stage })
    expect(at.pointer).toBe('left')
    expect(at.left).toBeGreaterThan(rect.x + 380)
    expect(at.left + COACH_W).toBeLessThanOrEqual(rect.x + rect.w)
    expect(at.top).toBeGreaterThanOrEqual(rect.y)
    expect(at.top + at.offset).toBeLessThan(rect.y + 40)
  })

  it('keeps an inside mark within a narrow target', () => {
    const rect = { x: 300, y: 80, w: 500, h: 600 }
    const at = coachPlacement({ rect, side: 'inside', height: 140, stage })
    expect(at.left + COACH_W).toBeLessThanOrEqual(rect.x + rect.w)
  })

  it('sits low in a drop zone, centred across it, with no pointer', () => {
    const rect = { x: 700, y: 100, w: 500, h: 600 }
    const at = coachPlacement({ rect, side: 'zone', height: 140, stage })
    expect(at.pointer).toBe('none')
    expect(at.left + COACH_W / 2).toBe(rect.x + rect.w / 2)
    expect(at.top + 70).toBe(rect.y + 450)
  })
})
