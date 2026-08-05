import { describe, expect, it } from 'vitest'
import { SECTIONS, sanitizeSectionOrder } from '../../../src/renderer/src/utils/settingsDefaults'

// Growing SECTIONS is the one change here that reaches settings files already on
// disk. A stored order predates every section added after it was written, so
// sanitize has to ADD the newcomer while keeping the order the user dragged —
// resetting to the default would silently undo their arrangement on upgrade.
describe('sanitizeSectionOrder', () => {
  it('keeps a user order and appends a section added since it was stored', () => {
    // Exactly what a settings.json written before Tools existed holds.
    const stored = ['snippets', 'saved', 'external']
    expect(sanitizeSectionOrder(stored)).toEqual(['snippets', 'saved', 'external', 'tools'])
  })

  it('appends every missing section, not just the last one', () => {
    expect(sanitizeSectionOrder(['snippets'])).toEqual([
      'snippets',
      ...SECTIONS.filter((id) => id !== 'snippets')
    ])
  })

  it('drops an unknown id rather than rendering a section that does not exist', () => {
    expect(sanitizeSectionOrder(['snippets', 'bogus', 'saved'])).toEqual([
      'snippets',
      'saved',
      ...SECTIONS.filter((id) => id !== 'snippets' && id !== 'saved')
    ])
  })

  it('drops a repeat instead of drawing the section twice', () => {
    const out = sanitizeSectionOrder(['snippets', 'snippets', 'saved'])
    expect(out).toHaveLength(SECTIONS.length)
    expect(new Set(out).size).toBe(SECTIONS.length)
    expect(out[0]).toBe('snippets')
  })

  it('falls back to the default order for anything that is not an array', () => {
    for (const bad of [null, undefined, 'saved', 42, {}]) {
      expect(sanitizeSectionOrder(bad)).toEqual(SECTIONS)
    }
  })

  it('always returns exactly the known sections, once each', () => {
    for (const input of [[], ['tools'], ['bogus'], [...SECTIONS].reverse()]) {
      expect([...sanitizeSectionOrder(input)].sort()).toEqual([...SECTIONS].sort())
    }
  })
})
