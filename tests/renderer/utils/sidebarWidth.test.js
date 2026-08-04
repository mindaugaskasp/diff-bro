import { describe, expect, it } from 'vitest'
import {
  SIDEBAR_MAX,
  SIDEBAR_W,
  clampSidebarWidth,
  readSidebarWidth
} from '../../../src/renderer/src/utils/sidebarWidth'

describe('clampSidebarWidth', () => {
  it('widens up to the cap and no further', () => {
    expect(clampSidebarWidth(SIDEBAR_W + 20)).toBe(SIDEBAR_W + 20)
    expect(clampSidebarWidth(SIDEBAR_MAX)).toBe(SIDEBAR_MAX)
    expect(clampSidebarWidth(4000)).toBe(SIDEBAR_MAX)
  })

  // The sidebar widens or it collapses to the rail; there is no in-between,
  // because a half-narrow list truncates every name without freeing real space.
  it('never narrows below the designed width', () => {
    expect(clampSidebarWidth(SIDEBAR_W - 1)).toBe(SIDEBAR_W)
    expect(clampSidebarWidth(0)).toBe(SIDEBAR_W)
    expect(clampSidebarWidth(-500)).toBe(SIDEBAR_W)
  })

  it('is half again the default at most', () => {
    expect(SIDEBAR_MAX).toBe(Math.round(SIDEBAR_W * 1.5))
  })

  it('falls back to the default on anything that is not a number', () => {
    for (const junk of [undefined, null, NaN, 'wide', {}]) {
      expect(clampSidebarWidth(junk), String(junk)).toBe(SIDEBAR_W)
    }
  })
})

describe('readSidebarWidth', () => {
  it('round-trips a stored width', () => {
    expect(readSidebarWidth(JSON.stringify({ width: SIDEBAR_W + 12 }))).toBe(SIDEBAR_W + 12)
  })

  // A hand-edited file must not be able to widen it past the cap, or leave the
  // sidebar a sliver nothing can be read in.
  it('clamps and defaults rather than trusting the file', () => {
    expect(readSidebarWidth(JSON.stringify({ width: 9000 }))).toBe(SIDEBAR_MAX)
    expect(readSidebarWidth(JSON.stringify({ width: 10 }))).toBe(SIDEBAR_W)
    expect(readSidebarWidth('{ not json')).toBe(SIDEBAR_W)
    expect(readSidebarWidth(null)).toBe(SIDEBAR_W)
  })
})
