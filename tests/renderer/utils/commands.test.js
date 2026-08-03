// The command registry is the single entry point for the OS menu, the in-app
// menu bar, the palette, the tools shelf and the sidebar rail. While it lived
// inside diffStore nothing could reach it without building the store, so an
// action name that resolved to nothing was invisible — a menu item that looks
// live and does nothing.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { COMMANDS, commandActions, runCommand } from '../../../src/renderer/src/utils/commands'
import { buildMenus } from '../../../src/renderer/src/menus'
import { flattenCommands } from '../../../src/renderer/src/utils/commandPalette'
import { TOOLS } from '../../../src/renderer/src/utils/tools'

const stores = () => ({
  diff: {
    hasUnsavedWork: true,
    canClear: true,
    canCompareStructure: true,
    renderSideBySide: true,
    semanticView: false,
    pick: vi.fn(),
    swap: vi.fn(),
    clear: vi.fn(),
    copyDiff: vi.fn(),
    applyPatch: vi.fn(),
    exportDiff: vi.fn(),
    exportCurrentImage: vi.fn(),
    shareCurrent: vi.fn(),
    importShared: vi.fn(),
    importSnippets: vi.fn(),
    addTrustedKey: vi.fn(),
    togglePasteMode: vi.fn(),
    toggleTheme: vi.fn(),
    requestActiveTabClose: vi.fn()
  },
  tabs: { newTab: vi.fn(), step: vi.fn() },
  settings: { sidebarCollapsed: false, setSidebarCollapsed: vi.fn(), noteToolUsed: vi.fn() },
  ui: {}
})

describe('the registry covers every surface that dispatches into it', () => {
  // buildMenus renders the installed version into its Help menu.
  beforeAll(() => {
    window.api = { appVersion: '0.0.0-test' }
  })

  // The in-app menu bar and the palette are built from the same tree.
  it('resolves every action the menu bar offers', () => {
    const missing = flattenCommands(buildMenus(() => {}))
      .map((c) => c.action)
      .filter((a) => a && !COMMANDS[a])
    expect(missing).toEqual([])
  })

  it('resolves every tool action from the shelf and the rail', () => {
    expect(TOOLS.map((t) => t.action).filter((a) => !COMMANDS[a])).toEqual([])
  })

  it('exposes its action names for a caller to check against', () => {
    expect(commandActions()).toContain('open-left')
    expect(commandActions().length).toBe(Object.keys(COMMANDS).length)
  })
})

describe('runCommand', () => {
  it('dispatches to the core store', () => {
    const s = stores()
    runCommand('open-left', s)
    expect(s.diff.pick).toHaveBeenCalledWith('left')
  })

  it('dispatches to a non-core store without the core reaching sideways', () => {
    const s = stores()
    runCommand('tab-next', s)
    expect(s.tabs.step).toHaveBeenCalledWith(1)
  })

  it('ignores an unknown action rather than throwing', () => {
    expect(() => runCommand('no-such-command', stores())).not.toThrow()
  })

  // One choke point, so a tool opened from the menu, a shortcut, the shelf or
  // the palette all count towards the shelf's recents.
  it('notes a tool as used whichever surface opened it', () => {
    const s = stores()
    runCommand('tools-json', s)
    expect(s.ui.textTool).toBe('json')
    expect(s.settings.noteToolUsed).toHaveBeenCalledWith('json')
  })

  it('does not note a non-tool command', () => {
    const s = stores()
    runCommand('swap', s)
    expect(s.settings.noteToolUsed).not.toHaveBeenCalled()
  })

  it('honours a guard rather than acting unconditionally', () => {
    const s = stores()
    s.diff.canClear = false
    runCommand('clear', s)
    expect(s.diff.clear).not.toHaveBeenCalled()
  })

  it('reads the settings store for a toggle that lives there', () => {
    const s = stores()
    runCommand('toggle-sidebar', s)
    expect(s.settings.setSidebarCollapsed).toHaveBeenCalledWith(true)
  })
})
