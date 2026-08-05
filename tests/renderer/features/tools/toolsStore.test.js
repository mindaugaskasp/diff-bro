import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useToolsStore } from '../../../../src/renderer/src/features/tools'
import { TOOLS } from '../../../../src/renderer/src/utils/tools'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('toolsStore', () => {
  it('starts with nothing pinned', () => {
    expect(useToolsStore().pinned).toEqual([])
  })

  it('pins and unpins a tool', () => {
    const s = useToolsStore()
    s.togglePin('json')
    expect(s.pinned).toEqual(['json'])
    expect(s.isPinned('json')).toBe(true)
    s.togglePin('json')
    expect(s.pinned).toEqual([])
    expect(s.isPinned('json')).toBe(false)
  })

  it('refuses a tool that is not in the registry', () => {
    const s = useToolsStore()
    s.togglePin('nope')
    expect(s.pinned).toEqual([])
  })

  it('survives a store re-creation', () => {
    useToolsStore().togglePin('regex')
    setActivePinia(createPinia())
    expect(useToolsStore().pinned).toEqual(['regex'])
  })

  // Stored pins outlive the registry: a tool removed in a later version, or a
  // hand-edited file, must not leave a blank row or a phantom pin.
  it('drops a stored id that is no longer a tool', () => {
    localStorage.setItem('diffbro.tools', JSON.stringify({ pinned: ['json', 'gone'] }))
    expect(useToolsStore().pinned).toEqual(['json'])
  })

  it('recovers from a corrupt or non-array stored value', () => {
    for (const raw of ['not json', '{"pinned":"json"}', '{}', 'null']) {
      localStorage.setItem('diffbro.tools', raw)
      setActivePinia(createPinia())
      expect(useToolsStore().pinned).toEqual([])
    }
  })

  it('drops repeats so a tool cannot be pinned twice', () => {
    localStorage.setItem('diffbro.tools', JSON.stringify({ pinned: ['json', 'json'] }))
    expect(useToolsStore().pinned).toEqual(['json'])
  })

  // The section reads this, so it is the getter that has to be pinned-first and
  // otherwise registry order — never the order the pins happened to be added.
  it('exposes rows pinned-first, in registry order', () => {
    const s = useToolsStore()
    s.togglePin('regex')
    s.togglePin('json')
    expect(s.rows.map((t) => t.id)).toEqual([
      'json',
      'regex',
      ...TOOLS.map((t) => t.id).filter((id) => id !== 'json' && id !== 'regex')
    ])
    expect(s.rows[0].pinned).toBe(true)
    expect(s.rows.at(-1).pinned).toBe(false)
  })
})
