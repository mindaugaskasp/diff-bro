import { describe, expect, it } from 'vitest'
import { SHORTCUT_GROUPS, SHORTCUT_BAR } from '../../../src/renderer/src/utils/shortcuts'

describe('shortcuts', () => {
  it('groups every advertised shortcut with a key label and description', () => {
    expect(SHORTCUT_GROUPS.length).toBeGreaterThan(0)
    for (const group of SHORTCUT_GROUPS) {
      expect(group.group).toBeTruthy()
      expect(group.items.length).toBeGreaterThan(0)
      for (const item of group.items) {
        expect(item.keys).toBeTruthy()
        expect(item.label).toBeTruthy()
      }
    }
  })

  it('labels resolve the platform modifier (Cmd on mac, Ctrl elsewhere)', () => {
    const mod = navigator.platform.toUpperCase().includes('MAC') ? 'Cmd' : 'Ctrl'
    const save = SHORTCUT_GROUPS.flatMap((g) => g.items).find((i) => i.label === 'Save diff')
    expect(save.keys).toBe(`${mod}+S`)
  })

  it('the compact bar list is a set of [keys, label] pairs', () => {
    expect(SHORTCUT_BAR.length).toBeGreaterThan(0)
    for (const pair of SHORTCUT_BAR) {
      expect(pair).toHaveLength(2)
      expect(pair[0]).toBeTruthy()
      expect(pair[1]).toBeTruthy()
    }
  })
})
