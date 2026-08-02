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

// This list IS what Help ▸ Keyboard Shortcuts shows, so a binding missing here
// is a binding nobody can discover. The tabs feature shipped four and none of
// them appeared.
describe('what the dialog advertises', () => {
  const keysFor = (label) =>
    SHORTCUT_GROUPS.flatMap((g) => g.items).find((i) => i.label === label)?.keys
  const mod = navigator.platform.toUpperCase().includes('MAC') ? 'Cmd' : 'Ctrl'

  it('lists every comparison-tab binding the menu defines', () => {
    expect(keysFor('New comparison')).toBe(`${mod}+Shift+T`)
    expect(keysFor('Close comparison')).toBe(`${mod}+Shift+W`)
    expect(keysFor('Next comparison')).toBe('Ctrl+Tab')
    expect(keysFor('Previous comparison')).toBe('Ctrl+Shift+Tab')
  })

  it('lists the command palette and paste-to-compare', () => {
    expect(keysFor('Command palette')).toBe(`${mod}+Shift+P`)
    expect(keysFor('Paste to compare')).toBe(`${mod}+V`)
  })

  it('never advertises the same combination twice', () => {
    const all = SHORTCUT_GROUPS.flatMap((g) => g.items).map((i) => i.keys)
    expect(new Set(all).size).toBe(all.length)
  })
})
