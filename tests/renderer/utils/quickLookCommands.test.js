import { describe, expect, it } from 'vitest'
import { CONVERT_TOOLS, convertItems } from '../../../src/renderer/src/utils/quickLookCommands'
import { rank } from '../../../src/renderer/src/utils/quickLook'
import { toolById } from '../../../src/renderer/src/utils/tools'

describe('launcher tools', () => {
  it('exposes each tool as a searchable command item', () => {
    const items = convertItems()
    expect(items).toHaveLength(CONVERT_TOOLS.length)
    expect(items.every((i) => i.kind === 'command')).toBe(true)
    // searchable by name through the shared rank()
    expect(rank('base64', items).map((i) => i.id)).toEqual(['base64'])
  })

  // The launcher's names are its own search aliases ("date" finds Epoch), but
  // every id must still exist in the registry or the row loses its icon/kind.
  it('every launcher tool is in the shared registry', () => {
    for (const t of CONVERT_TOOLS) expect(toolById(t.id), t.id).toBeDefined()
  })

  it('takes its icon and action word from the registry, never a blanket label', () => {
    const items = convertItems()
    const byId = Object.fromEntries(items.map((i) => [i.id, i]))
    expect(byId.base64).toMatchObject({ icon: 'binary', action: 'Encode' })
    expect(byId.jwt).toMatchObject({ icon: 'shield-check', action: 'Decode' })
    expect(byId.uuid).toMatchObject({ icon: 'hash', action: 'Generate' })
    expect(items.every((i) => i.action !== 'Convert' || i.id === 'epoch')).toBe(true)
  })

  it('every tool renders a rich panel', () => {
    for (const t of CONVERT_TOOLS) expect(typeof t.panel).toBe('string')
    expect(convertItems().every((i) => i.panel)).toBe(true)
  })

  it('finds a tool by its alias, not just its registry name', () => {
    expect(rank('date', convertItems()).map((i) => i.id)).toContain('epoch')
  })
})
