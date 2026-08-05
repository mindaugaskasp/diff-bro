import { beforeAll, describe, expect, it } from 'vitest'
import { SHORTCUT_GROUPS, SHORTCUT_BAR } from '../../../src/renderer/src/utils/shortcuts'
import { buildMenus } from '../../../src/renderer/src/menus'

describe('shortcuts', () => {
  it('groups every advertised shortcut with a key label and description', () => {
    expect(SHORTCUT_GROUPS.length).toBeGreaterThan(0)
    for (const group of SHORTCUT_GROUPS) {
      expect(group.id).toBeTruthy()
      expect(group.labelKey).toBeTruthy()
      expect(group.items.length).toBeGreaterThan(0)
      for (const item of group.items) {
        expect(item.keys).toBeTruthy()
        // A key ID, not text — utils/ is pure, so the component translates it.
        expect(item.labelKey).toMatch(/^shortcuts\./)
      }
    }
  })

  it('labels resolve the platform modifier (Cmd on mac, Ctrl elsewhere)', () => {
    const mod = navigator.platform.toUpperCase().includes('MAC') ? 'Cmd' : 'Ctrl'
    const save = SHORTCUT_GROUPS.flatMap((g) => g.items).find(
      (i) => i.labelKey === 'shortcuts.saveDiff'
    )
    expect(save.keys).toBe(`${mod}+S`)
  })

  it('the compact bar list carries keys and a catalogue label', () => {
    expect(SHORTCUT_BAR.length).toBeGreaterThan(0)
    for (const { keys, labelKey } of SHORTCUT_BAR) {
      expect(keys).toBeTruthy()
      expect(labelKey).toMatch(/^shortcuts\.bar\./)
    }
  })
})

// This list IS what Help ▸ Keyboard Shortcuts shows, so a binding missing here
// is a binding nobody can discover. The tabs feature shipped four and none of
// them appeared.
describe('what the dialog advertises', () => {
  const keysFor = (labelKey) =>
    SHORTCUT_GROUPS.flatMap((g) => g.items).find((i) => i.labelKey === labelKey)?.keys
  const mod = navigator.platform.toUpperCase().includes('MAC') ? 'Cmd' : 'Ctrl'

  it('lists every comparison-tab binding the menu defines', () => {
    expect(keysFor('shortcuts.newComparison')).toBe(`${mod}+Shift+T`)
    expect(keysFor('shortcuts.closeComparison')).toBe(`${mod}+Shift+W`)
    expect(keysFor('shortcuts.nextComparison')).toBe('Ctrl+Tab')
    expect(keysFor('shortcuts.prevComparison')).toBe('Ctrl+Shift+Tab')
  })

  it('lists the command palette and paste-to-compare', () => {
    expect(keysFor('shortcuts.commandPalette')).toBe(`${mod}+Shift+P`)
    expect(keysFor('shortcuts.pasteToCompare')).toBe(`${mod}+V`)
  })

  it('never advertises the same combination twice', () => {
    const all = SHORTCUT_GROUPS.flatMap((g) => g.items).map((i) => i.keys)
    expect(new Set(all).size).toBe(all.length)
  })
})

// The list above IS what Help ▸ Keyboard Shortcuts shows, and the menus are what
// actually BIND the keys — so the two can disagree silently, and did: Copy Diff
// as File and Toggle Sidebar both worked and neither was discoverable. Six
// hardcoded labels cannot catch that; comparing the two sources can.
describe('the shortcuts dialog against the menus that bind the keys', () => {
  // buildMenus renders the installed version into its Help menu.
  beforeAll(() => {
    window.api = new Proxy({ appVersion: '0.0.0-test' }, { get: (t, k) => t[k] ?? (() => {}) })
  })

  // Advertised app-wide but bound in main rather than in a menu leaf, or
  // appended live because the user can rebind it (KeyboardShortcutsDialog.vue).
  // Bound outside the menu tree: paste-to-compare is a window-level gesture
  // (features/pasteToCompare), find-in-diff is Monaco's own, and quick look-up
  // is a user-rebindable global appended live by KeyboardShortcutsDialog.
  const NOT_IN_MENUS = new Set([
    'shortcuts.quickLookAppWide',
    'shortcuts.findInDiff',
    'shortcuts.pasteToCompare'
  ])

  const menuKeys = () => {
    const seen = new Map()
    const walk = (items) => {
      for (const item of items ?? []) {
        if (item.keys) seen.set(item.keys, item.label)
        walk(item.items ?? item.children)
      }
    }
    walk(buildMenus(() => {}))
    return seen
  }

  it('advertises every key a menu binds', () => {
    const advertised = new Set(SHORTCUT_GROUPS.flatMap((g) => g.items).map((i) => i.keys))
    const missing = [...menuKeys()]
      .filter(([keys]) => !advertised.has(keys))
      .map(([keys, label]) => `${keys} (${label})`)
    expect(missing, 'bound by a menu but absent from the shortcuts dialog').toEqual([])
  })

  it('advertises nothing that no longer exists', () => {
    const bound = new Set(menuKeys().keys())
    const stale = SHORTCUT_GROUPS.flatMap((g) => g.items)
      .filter((i) => !bound.has(i.keys) && !NOT_IN_MENUS.has(i.labelKey))
      .map((i) => `${i.keys} (${i.labelKey})`)
    expect(stale, 'advertised in the dialog but bound by nothing').toEqual([])
  })
})
