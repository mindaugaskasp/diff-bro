import { describe, expect, it } from 'vitest'
import {
  MAX_RECENT_TOOLS,
  SHELF_RECENT_TOOLS,
  TOOLS,
  noteRecent,
  recentTools,
  toolById,
  toolPaletteItems,
  toolSections
} from '../../../src/renderer/src/utils/tools'
import { ICONS } from '../../../src/renderer/src/icons'

// Both tool surfaces render straight from this list, so a malformed entry (a
// missing icon, a stale action) breaks a row with no other signal.
describe('TOOLS registry', () => {
  it('declares a complete descriptor for every tool', () => {
    for (const t of TOOLS) {
      expect(typeof t.id).toBe('string')
      expect(typeof t.name).toBe('string')
      expect(typeof t.kind).toBe('string')
      expect(t.action.length).toBeGreaterThan(0)
    }
  })

  it('has unique ids', () => {
    expect(new Set(TOOLS.map((t) => t.id)).size).toBe(TOOLS.length)
  })

  // The icon map is the other half of the contract: a typo here renders nothing.
  it('names an icon that exists in the icon map', () => {
    for (const t of TOOLS) expect(ICONS[t.icon], `${t.id} → ${t.icon}`).toBeDefined()
  })

  it('never labels a tool with the old blanket "Convert" except where it is true', () => {
    const kinds = TOOLS.filter((t) => t.kind === 'Convert').map((t) => t.id)
    expect(kinds).toEqual(['epoch'])
  })

  it('finds a tool by id and ignores an unknown one', () => {
    expect(toolById('json')).toMatchObject({ name: 'JSON', icon: 'braces' })
    expect(toolById('nope')).toBeUndefined()
  })
})

describe('recentTools', () => {
  it('maps ids to tools, most-recent-first', () => {
    expect(recentTools(['uuid', 'json']).map((t) => t.id)).toEqual(['uuid', 'json'])
  })

  it('drops ids no longer in the registry', () => {
    expect(recentTools(['json', 'gone', 'uuid']).map((t) => t.id)).toEqual(['json', 'uuid'])
  })

  it('drops repeats', () => {
    expect(recentTools(['json', 'json']).map((t) => t.id)).toEqual(['json'])
  })

  it('caps at MAX_RECENT_TOOLS', () => {
    const ids = TOOLS.map((t) => t.id)
    expect(ids.length).toBeGreaterThan(MAX_RECENT_TOOLS)
    expect(recentTools(ids)).toHaveLength(MAX_RECENT_TOOLS)
  })

  it('handles missing/empty input', () => {
    expect(recentTools(undefined)).toEqual([])
    expect(recentTools([])).toEqual([])
  })

  // Surfaces disagree about how many fit: the collapsed rail shows every one it
  // remembers, the expanded shelf fewer, because its chips carry labels and wrap.
  it('takes a smaller limit from a surface that has less room', () => {
    const ids = TOOLS.map((t) => t.id)
    expect(recentTools(ids, SHELF_RECENT_TOOLS)).toHaveLength(SHELF_RECENT_TOOLS)
    expect(SHELF_RECENT_TOOLS).toBeLessThan(MAX_RECENT_TOOLS)
  })

  // The number REMEMBERED has to be at least the largest surface, or the rail
  // could never fill up whatever its own limit said.
  it('remembers as many as the rail has room for', () => {
    expect(MAX_RECENT_TOOLS).toBe(9)
    let ids = []
    for (const t of TOOLS.slice(0, MAX_RECENT_TOOLS + 1)) ids = noteRecent(ids, t.id)
    expect(ids).toHaveLength(MAX_RECENT_TOOLS)
    expect(recentTools(ids)).toHaveLength(MAX_RECENT_TOOLS)
  })
})

describe('noteRecent', () => {
  it('puts the used tool first', () => {
    expect(noteRecent(['json', 'uuid'], 'xml')).toEqual(['xml', 'json', 'uuid'])
  })

  it('promotes a tool already in the list instead of duplicating it', () => {
    expect(noteRecent(['json', 'uuid', 'xml'], 'xml')).toEqual(['xml', 'json', 'uuid'])
  })

  // Written against the cap rather than a literal list, so changing how many
  // recents the shelf holds does not mean rewriting the expectation.
  it('caps the list at MAX_RECENT_TOOLS, keeping the most recent', () => {
    // Enough to overflow whatever the cap is, so this survives it changing.
    const ids = TOOLS.filter((t) => t.id !== 'epoch')
      .map((t) => t.id)
      .slice(0, MAX_RECENT_TOOLS)
    const out = noteRecent(ids, 'epoch')
    expect(out).toHaveLength(MAX_RECENT_TOOLS)
    expect(out[0]).toBe('epoch')
    expect(out).toEqual(['epoch', ...ids].slice(0, MAX_RECENT_TOOLS))
  })

  it('ignores an unknown tool but still returns a capped list', () => {
    expect(noteRecent(['json'], 'nope')).toEqual(['json'])
    expect(noteRecent(undefined, 'nope')).toEqual([])
  })
})

describe('toolSections', () => {
  it('omits the Recent section when there are no recents', () => {
    const sections = toolSections([])
    expect(sections.map((s) => s.label)).toEqual(['All tools'])
    expect(sections[0].items).toHaveLength(TOOLS.length)
  })

  // Listing a recent tool again under "All tools" read as a duplicate row.
  it('puts Recent first and lists each tool exactly once', () => {
    const sections = toolSections(['uuid'])
    expect(sections.map((s) => s.label)).toEqual(['Recent', 'Other tools'])
    expect(sections[0].items.map((t) => t.id)).toEqual(['uuid'])
    expect(sections[1].items.some((t) => t.id === 'uuid')).toBe(false)
    expect(sections[0].items.length + sections[1].items.length).toBe(TOOLS.length)
  })
})

describe('toolPaletteItems', () => {
  it('flattens to one list, labelling only the row that opens each section', () => {
    const items = toolPaletteItems(['uuid', 'json'])
    expect(items[0]).toMatchObject({ id: 'uuid', section: 'Recent' })
    expect(items[1]).toMatchObject({ id: 'json', section: '' })
    expect(items[2].section).toBe('Other tools')
    expect(items.filter((i) => i.section)).toHaveLength(2)
  })

  it('is every tool, once, however many are recent', () => {
    expect(toolPaletteItems([])).toHaveLength(TOOLS.length)
    expect(toolPaletteItems(['uuid', 'json'])).toHaveLength(TOOLS.length)
    const ids = toolPaletteItems(['uuid', 'json']).map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('does not mutate the registry entries it copies', () => {
    toolPaletteItems(['uuid'])
    expect(TOOLS.every((t) => !('section' in t))).toBe(true)
  })
})
