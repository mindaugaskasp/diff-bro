import { describe, expect, it } from 'vitest'
import { needsUpdate } from '../../../../src/renderer/src/features/lan/peerVersion'

describe('needsUpdate', () => {
  it('is true for a peer on the version before the confirm step, or one that names none', () => {
    expect(needsUpdate({ version: 1 })).toBe(true)
    expect(needsUpdate({})).toBe(true)
  })

  it('is false for a peer on the current version or newer', () => {
    expect(needsUpdate({ version: 2 })).toBe(false)
    expect(needsUpdate({ version: 3 })).toBe(false)
  })
})
