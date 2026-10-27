import { describe, expect, it } from 'vitest'
import { TOOLS } from '../../../src/renderer/src/utils/tools'
import { TOOL_GROUPS, toolHue, toolTileGroups } from '../../../src/renderer/src/utils/toolGroups'

describe('toolGroups', () => {
  it('puts every registered tool in exactly one group', () => {
    const grouped = TOOL_GROUPS.flatMap((g) => g.ids)
    expect([...grouped].sort()).toEqual(TOOLS.map((t) => t.id).sort())
    expect(new Set(grouped).size).toBe(grouped.length)
  })

  it('names no tool the registry does not have', () => {
    const ids = new Set(TOOLS.map((t) => t.id))
    for (const g of TOOL_GROUPS) for (const id of g.ids) expect(ids.has(id)).toBe(true)
  })

  it('gives a tool the hue of its group', () => {
    expect(toolHue('jwt')).toBe('inspect')
    expect(toolHue('nope')).toBe('format')
  })

  describe('toolTileGroups', () => {
    const tools = TOOLS.map((t) => ({ id: t.id }))
    const ids = (group) => group.tools.map((t) => t.id)

    it('leads with a Pinned group in pin order', () => {
      const [pinned] = toolTileGroups(tools, ['regex', 'base64'])
      expect(pinned.key).toBe('pinned')
      expect(ids(pinned)).toEqual(['regex', 'base64'])
    })

    it('takes a pinned tool out of its job group', () => {
      const groups = toolTileGroups(tools, ['jwt'])
      expect(ids(groups.find((g) => g.key === 'inspect'))).toEqual(['regex'])
    })

    it('has no Pinned group when nothing is pinned', () => {
      expect(toolTileGroups(tools, []).map((g) => g.key)).toEqual(TOOL_GROUPS.map((g) => g.hue))
    })

    it('drops groups the search emptied, Pinned included', () => {
      const groups = toolTileGroups([{ id: 'uuid' }], ['regex'])
      expect(groups.map((g) => g.key)).toEqual(['generate'])
    })
  })
})
