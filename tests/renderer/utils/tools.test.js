import { describe, expect, it } from 'vitest'
import {
  MAX_RECENT_TOOLS,
  TOOLS,
  noteRecent,
  recentTools,
  toolById,
  toolPaletteItems,
  toolRows,
  toolSections
} from '../../../src/renderer/src/utils/tools'
import { ICONS } from '../../../src/renderer/src/icons'
import { createTranslator } from '../../../src/shared/i18n'

// The real catalogue: a nameKey/kindKey with no entry must fail here, not render
// as a raw id in the sidebar.
const t = createTranslator('en')

// Both tool surfaces render straight from this list, so a malformed entry (a
// missing icon, a stale action) breaks a row with no other signal.
describe('TOOLS registry', () => {
  it('declares a complete descriptor for every tool', () => {
    for (const tool of TOOLS) {
      expect(typeof tool.id).toBe('string')
      expect(t(tool.nameKey)).not.toBe(tool.nameKey)
      expect(t(tool.kindKey)).not.toBe(tool.kindKey)
      // The one-line description every surface (dialog, tooltip) reads — a
      // tool without one greets a first-time user with a bare input box.
      expect(t(tool.descKey)).not.toBe(tool.descKey)
      expect(tool.action.length).toBeGreaterThan(0)
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
    const kinds = TOOLS.filter((tool) => t(tool.kindKey) === 'Convert').map((tool) => tool.id)
    expect(kinds).toEqual(['epoch'])
  })

  it('finds a tool by id and ignores an unknown one', () => {
    expect(toolById('json')).toMatchObject({ nameKey: 'tools.json.name', icon: 'braces' })
    expect(t(toolById('json').nameKey)).toBe('JSON')
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

// The sidebar section and the rail both order by PINS, never by recency. The
// shelf they replace moved the tool you had just used to the front, so the row
// under the cursor changed as a side effect of using it.
describe('toolRows', () => {
  const ids = (rows) => rows.map((t) => t.id)
  const registryOrder = TOOLS.map((t) => t.id)

  it('puts pinned tools first, both groups in registry order', () => {
    // 'uuid' is registry index 3, 'json' index 1 — pinned in the wrong order on
    // purpose, so "registry order" is what is being asserted, not input order.
    expect(ids(toolRows(['uuid', 'json']))).toEqual([
      'json',
      'uuid',
      ...registryOrder.filter((id) => id !== 'json' && id !== 'uuid')
    ])
  })

  // The load-bearing assertion. A naive implementation that concatenates the
  // pinned ids as given passes every other test in this block and fails this one.
  it('is unchanged by the order the pins were added', () => {
    const base = ids(toolRows(['uuid', 'json', 'regex']))
    for (const perm of [
      ['json', 'regex', 'uuid'],
      ['regex', 'uuid', 'json'],
      ['json', 'uuid', 'regex']
    ]) {
      expect(ids(toolRows(perm))).toEqual(base)
    }
  })

  it('lists every tool exactly once', () => {
    const out = ids(toolRows(['json']))
    expect(out).toHaveLength(TOOLS.length)
    expect(new Set(out).size).toBe(TOOLS.length)
  })

  it('is plain registry order with nothing pinned', () => {
    expect(ids(toolRows([]))).toEqual(registryOrder)
    expect(ids(toolRows(undefined))).toEqual(registryOrder)
  })

  // Stored pins outlive the registry: a hand-edited settings file or a tool
  // removed in a later version must not render a blank row.
  it('ignores a pinned id that is no longer a tool', () => {
    expect(ids(toolRows(['gone', 'json']))).toEqual([
      'json',
      ...registryOrder.filter((id) => id !== 'json')
    ])
  })

  it('takes a limit from a surface with less room, pins first', () => {
    expect(ids(toolRows(['regex'], 3))).toEqual(['regex', 'base64', 'json'])
  })

  it('marks which rows are pinned so the row can draw its own state', () => {
    const rows = toolRows(['json'])
    expect(rows[0]).toMatchObject({ id: 'json', pinned: true })
    expect(rows[1].pinned).toBe(false)
  })

  it('does not mutate the registry entries it copies', () => {
    toolRows(['json'])
    expect(TOOLS.every((t) => !('pinned' in t))).toBe(true)
  })
})

describe('toolSections', () => {
  it('omits the Recent section when there are no recents', () => {
    const sections = toolSections([])
    expect(sections.map((sec) => t(sec.labelKey))).toEqual(['All tools'])
    expect(sections[0].items).toHaveLength(TOOLS.length)
  })

  // Listing a recent tool again under "All tools" read as a duplicate row.
  it('puts Recent first and lists each tool exactly once', () => {
    const sections = toolSections(['uuid'])
    expect(sections.map((sec) => t(sec.labelKey))).toEqual(['Recent', 'Other tools'])
    expect(sections[0].items.map((t) => t.id)).toEqual(['uuid'])
    expect(sections[1].items.some((t) => t.id === 'uuid')).toBe(false)
    expect(sections[0].items.length + sections[1].items.length).toBe(TOOLS.length)
  })
})

describe('toolPaletteItems', () => {
  it('flattens to one list, labelling only the row that opens each section', () => {
    const items = toolPaletteItems(['uuid', 'json'])
    expect(items[0]).toMatchObject({ id: 'uuid', sectionKey: 'tools.section.recent' })
    expect(items[1]).toMatchObject({ id: 'json', sectionKey: '' })
    expect(t(items[2].sectionKey)).toBe('Other tools')
    expect(items.filter((i) => i.sectionKey)).toHaveLength(2)
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
