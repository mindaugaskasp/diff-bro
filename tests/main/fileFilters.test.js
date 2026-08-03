import { describe, expect, it } from 'vitest'
import { FORMAT_IDS, filtersFor } from '../../src/main/fileFilters'

// The renderer names a format and main resolves it. Anything unrecognised must
// fall back to an unfiltered dialog rather than an empty filter list, which
// would show the user a picker that matches nothing.
describe('filtersFor', () => {
  it('resolves each format the empty-state tiles offer', () => {
    for (const id of FORMAT_IDS) {
      const filters = filtersFor(id)
      expect(filters, id).toBeDefined()
      expect(filters[0].extensions.length).toBeGreaterThan(0)
    }
  })

  it('puts the chosen type first and keeps All files reachable', () => {
    const filters = filtersFor('xlsx')
    expect(filters[0]).toEqual({ name: 'Excel workbook', extensions: ['xlsx'] })
    expect(filters[filters.length - 1]).toEqual({ name: 'All files', extensions: ['*'] })
  })

  it('covers the common aliases of a format, not just its headline extension', () => {
    expect(filtersFor('yaml')[0].extensions).toEqual(['yaml', 'yml'])
    expect(filtersFor('markdown')[0].extensions).toContain('md')
  })

  it('is undefined for an unknown, missing or non-string format', () => {
    for (const bad of ['nope', '', undefined, null, 42, {}, ['xlsx'], '__proto__', 'constructor']) {
      expect(filtersFor(bad), String(bad)).toBeUndefined()
    }
  })
})

// The empty state offers a Mermaid tile, so main has to know the key — the
// renderer names a format and never supplies extensions of its own (rule 6).
describe('mermaid', () => {
  it('filters to diagram sources and still offers All files', () => {
    const filters = filtersFor('mermaid')
    expect(filters[0].extensions).toEqual(expect.arrayContaining(['mmd', 'mermaid']))
    expect(filters.at(-1).extensions).toEqual(['*'])
  })
})
