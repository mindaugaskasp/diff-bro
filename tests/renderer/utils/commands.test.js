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
import { useUiStore } from '../../../src/renderer/src/stores/uiStore'
import { createPinia, setActivePinia } from 'pinia'

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
    ready: true,
    mode: 'files',
    comparableKind: 'text',
    isSavedDiff: false,
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
  ui: { zoomDiff: spy(), openSettings: spy() },
  snippets: { startNewSnippetFrom: spy() },
  share: { shareCurrent: spy(), importShared: spy(), addTrustedKey: spy() },
  imageExport: { exportCurrentImage: spy() },
  configBackup: { open: spy(), pendingPath: null },
  onboarding: {
    replay: spy(),
    openDemo: spy(),
    openSnippet: spy(),
    closeSnippet: spy(),
    typeSearch: spy(),
    clearSearch: spy(),
    clearFilters: spy(),
    armChord: spy(),
    disarmChord: spy()
  }
})

describe('the registry covers every surface that dispatches into it', () => {
  // buildMenus renders the installed version into its Help menu. A few leaves
  // reach the preload directly rather than the registry (Quick Look-up, Quit);
  // those are not this test's business, so every call is a no-op.
  beforeAll(() => {
    window.api = new Proxy(
      { appVersion: '0.0.0-test' },
      { get: (target, key) => target[key] ?? (() => {}) }
    )
  })

  // The in-app menu bar and the palette are built from the same tree. A menu
  // leaf carries a `run()` closure, not an action name, so the only way to learn
  // which action it dispatches is to call it — reading `.action` off the
  // flattened rows found nothing to check and passed no matter what broke.
  it('resolves every action the menu bar offers', () => {
    const dispatched = []
    for (const command of flattenCommands(buildMenus((action) => dispatched.push(action)))) {
      command.run()
    }
    expect(dispatched.length).toBeGreaterThan(20)
    expect(dispatched.filter((a) => !COMMANDS[a])).toEqual([])
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

// Hiding a toolbar control does nothing for the shortcut, the menu item or the
// palette — they all land here, which is why the guard lives here.
describe('guards that a hidden control would otherwise not enforce', () => {
  it('refuses to switch input mode on a saved diff', () => {
    const s = stores()
    s.diff.isSavedDiff = true
    runCommand('toggle-paste', s)
    expect(s.diff.togglePasteMode).not.toHaveBeenCalled()

    const scratch = stores()
    runCommand('toggle-paste', scratch)
    expect(scratch.diff.togglePasteMode).toHaveBeenCalled()
  })

  it('refuses to flip split view where nothing reads it', () => {
    for (const kind of ['spreadsheet', 'tree', 'streamed']) {
      const s = stores()
      s.diff.comparableKind = kind
      s.diff.renderSideBySide = true
      runCommand('toggle-split', s)
      expect(s.diff.renderSideBySide, kind).toBe(true)
    }
  })

  it('still flips it for a text diff and a diagram', () => {
    for (const kind of ['text', 'diagram']) {
      const s = stores()
      s.diff.comparableKind = kind
      s.diff.renderSideBySide = true
      runCommand('toggle-split', s)
      expect(s.diff.renderSideBySide, kind).toBe(false)
    }
  })

  // openToolsPalette narrows the scope; only this command widens it again. The
  // pairing was unasserted, so a palette stuck in tools-only after one "Search
  // every tool" press would have shipped silently.
  it('reopens the palette at full scope after a tools-scoped one', () => {
    setActivePinia(createPinia())
    const ui = useUiStore()
    ui.openToolsPalette()
    expect(ui.paletteScope).toBe('tools')
    COMMANDS['command-palette']({ ui })
    expect(ui.paletteScope).toBe('all')
    expect(ui.showCommandPalette).toBe(true)
  })
})
