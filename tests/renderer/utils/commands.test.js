// The command registry is the single entry point for the OS menu, the in-app
// menu bar, the palette, the tools shelf and the sidebar rail. While it lived
// inside diffStore nothing could reach it without building the store, so an
// action name that resolved to nothing was invisible — a menu item that looks
// live and does nothing.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  COMMANDS,
  commandActions,
  runCliCommand,
  runCommand
} from '../../../src/renderer/src/utils/commands'
import { buildMenus } from '../../../src/renderer/src/menus'
import { flattenCommands } from '../../../src/renderer/src/utils/commandPalette'
import { TOOLS } from '../../../src/renderer/src/utils/tools'

const spy = () => vi.fn()

// Shaped like the real bundle useCommands supplies, since a handler that
// destructures the wrong store throws only when it runs. Nine of them did.
const stores = () => ({
  diff: {
    hasUnsavedWork: true,
    canClear: true,
    canCompareStructure: true,
    renderSideBySide: true,
    semanticView: false,
    showSaveDialog: false,
    pick: spy(),
    swap: spy(),
    clear: spy(),
    copyDiff: spy(),
    copyDiffAsFile: spy(),
    applyPatch: spy(),
    exportDiff: spy(),
    importSnippets: spy(),
    togglePasteMode: spy(),
    saveClipboardSnippet: spy(),
    receive: spy(),
    showNotice: spy(),
    blockedFiles: []
  },
  tabs: {
    newTab: spy(),
    step: spy(),
    requestActiveClose: spy(),
    canHost: () => true,
    markActiveTransient: spy()
  },
  settings: {
    sidebarCollapsed: false,
    setSidebarCollapsed: spy(),
    noteToolUsed: spy(),
    toggleTheme: spy()
  },
  ui: {},
  snippets: { startNewSnippetFrom: spy() },
  share: { shareCurrent: spy(), importShared: spy(), addTrustedKey: spy() },
  imageExport: { exportCurrentImage: spy() },
  configBackup: { open: spy(), pendingPath: null }
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
    runCommand('clear', s)
    expect(s.diff.clear).toHaveBeenCalled()

    const guarded = stores()
    guarded.diff.canClear = false
    runCommand('clear', guarded)
    expect(guarded.diff.clear).not.toHaveBeenCalled()
  })

  // The real defence: a handler destructuring the wrong store throws only when
  // it runs, and nine of them were wrong at one point. Running every action
  // against a bundle shaped like the live one is what catches that.
  it('runs every registered action without reaching for a store it was not given', () => {
    for (const action of commandActions()) {
      expect(() => runCommand(action, stores()), action).not.toThrow()
    }
  })

  it('runs every CLI command the same way', async () => {
    const commands = [
      { name: 'create-snippet' },
      { name: 'clipboard-save', text: '{}' },
      { name: 'compare', files: ['/tmp/a.txt'] },
      { name: 'backup', path: '/tmp/out' }
    ]
    for (const command of commands) {
      await expect(Promise.resolve(runCliCommand(command, stores()))).resolves.not.toThrow()
    }
  })

  it('reads the settings store for a toggle that lives there', () => {
    const s = stores()
    runCommand('toggle-sidebar', s)
    expect(s.settings.setSidebarCollapsed).toHaveBeenCalledWith(true)
  })
})
