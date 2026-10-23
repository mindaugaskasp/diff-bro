import { describe, expect, it } from 'vitest'
import { TOOLS } from '../../../src/renderer/src/utils/tools'
import { TOOL_GROUPS, toolHue } from '../../../src/renderer/src/utils/toolGroups'

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
})
