// Every action a menu, shortcut, palette entry, shelf chip or rail button can
// trigger, in one place. Handlers receive the stores they need rather than
// importing them, so this stays pure and the core store never reaches sideways
// into a feature to satisfy a menu item.

import { TOOLS } from './tools'
import { MAX_TABS } from './tabs'
import { tabsFullMessage } from './cliCommand'

/**
 * @typedef {object} CommandStores
 * @property {object} diff          core comparison state
 * @property {object} tabs
 * @property {object} settings
 * @property {object} [snippets]
 * @property {object} ui             dialog / palette chrome
 * @property {object} [imageExport]
 * @property {object} [configBackup]
 * @property {object} [share]
 */

const openTool = (tool) => (s) => (s.ui.textTool = tool)

/** @type {Record<string, (stores: CommandStores) => void>} */
export const COMMANDS = {
  'open-left': ({ diff }) => diff.pick('left'),
  'open-right': ({ diff }) => diff.pick('right'),
  save: ({ diff }) => {
    if (diff.hasUnsavedWork) diff.showSaveDialog = true
  },
  'share-current': ({ share }) => share.shareCurrent(),
  swap: ({ diff }) => diff.swap(),
  clear: ({ diff }) => {
    if (diff.canClear) diff.clear()
  },
  'copy-diff': ({ diff }) => diff.copyDiff(),
  'copy-diff-file': ({ diff }) => diff.copyDiffAsFile(),
  'apply-patch': ({ diff }) => diff.applyPatch(),
  'export-html': ({ diff }) => diff.exportDiff(),
  'export-image': ({ imageExport }) => imageExport.exportCurrentImage(),
  'tab-new': ({ tabs }) => tabs.newTab(),
  'tab-next': ({ tabs }) => tabs.step(1),
  'tab-prev': ({ tabs }) => tabs.step(-1),
  'tab-close': ({ tabs }) => tabs.requestActiveClose(),
  'import-snippets': ({ diff }) => diff.importSnippets(),
  'toggle-paste': ({ diff }) => diff.togglePasteMode(),
  'toggle-sidebar': ({ settings }) => settings.setSidebarCollapsed(!settings.sidebarCollapsed),
  'toggle-split': ({ diff }) => (diff.renderSideBySide = !diff.renderSideBySide),
  'toggle-structure': ({ diff }) => {
    if (diff.canCompareStructure) diff.semanticView = !diff.semanticView
  },
  'toggle-theme': ({ settings }) => settings.toggleTheme(),
  'import-shared': ({ share }) => share.importShared(),
  'export-pubkey': ({ share }) => (share.showShareKeyDialog = true),
  'rotate-key': ({ share }) => (share.showRotateKeyDialog = true),
  'copy-pubkey': ({ share }) => (share.showShareKeyDialog = true),
  'add-trusted-key': ({ share }) => share.addTrustedKey(),
  'manage-keys': ({ share }) => (share.showTrustedKeysDialog = true),
  'config-backup': ({ configBackup }) => configBackup.open('backup'),
  'config-restore': ({ configBackup }) => configBackup.open('restore'),
  settings: ({ ui }) => (ui.showSettingsDialog = true),
  'command-palette': ({ ui }) => {
    ui.paletteScope = 'all'
    ui.showCommandPalette = true
  },
  'tools-base64': openTool('base64'),
  'tools-json': openTool('json'),
  'tools-xml': openTool('xml'),
  'tools-hash': openTool('hash'),
  'tools-regex': openTool('regex'),
  'tools-uuid': openTool('uuid'),
  'tools-jwt': openTool('jwt'),
  'tools-epoch': openTool('epoch'),
  'tools-url': openTool('url'),
  'tools-lines': openTool('lines'),
  'tools-crypt': ({ ui }) => (ui.showCryptDialog = true),
  shortcuts: ({ ui }) => (ui.showShortcutsDialog = true)
}

export const commandActions = () => Object.keys(COMMANDS)

/**
 * @param {string} action
 * @param {CommandStores} stores
 */
export function runCommand(action, stores) {
  COMMANDS[action]?.(stores)
  // One choke point, so a tool opened from the menu, a shortcut, the shelf or
  // the palette all count towards the shelf's recents.
  const tool = TOOLS.find((t) => t.action === action)
  if (tool) stores.settings.noteToolUsed(tool.id)
}

// The `diffbro …` launch, forwarded by main. A dispatch table like the one
// above, and here for the same reason: the core store cannot reach into a
// slice to satisfy a command.
/** @type {Record<string, (stores: CommandStores, command: object) => unknown>} */
export const CLI_COMMANDS = {
  'create-snippet': ({ snippets }) => snippets.startNewSnippetFrom('', 'auto'),
  'clipboard-save': ({ diff }, command) => diff.saveClipboardSnippet(command.text),
  compare: ({ diff, tabs }, command) =>
    compareFromCli({ diff, tabs }, command.files, command.transient === true),
  // The passphrase is asked for here, not in the terminal: the bundle is
  // assembled in the renderer, so this is where the flow already lives.
  backup: ({ configBackup }, command) => {
    configBackup.pendingPath = command.path
    configBackup.open('backup')
  }
}

/**
 * @param {{name: string}} command
 * @param {CommandStores} stores
 */
export const runCliCommand = (command, stores) => CLI_COMMANDS[command?.name]?.(stores, command)

// `diffbro <file> [file]`. Whether there is room HERE comes from the live
// comparison, not the active tab's snapshot: a snapshot is only captured when
// tabs switch, so the tab you are looking at still reads as blank while it
// holds a diff.
async function compareFromCli({ diff, tabs }, files, transient) {
  if (diff.left || diff.right) {
    if (!tabs.canHost(transient)) {
      // Every launch blocked so far, not just this one: git calls the tool
      // once per conflicted file and moves on without reading the answer.
      diff.blockedFiles = [...diff.blockedFiles, ...(files ?? [])]
      diff.cliBlocked = tabsFullMessage(diff.blockedFiles, MAX_TABS)
      return
    }
    tabs.newTab({ transient })
  }
  tabs.markActiveTransient(transient)
  const sides = ['left', 'right']
  for (const [i, path] of (files ?? []).entries()) {
    // A path from a shell is not one the app chose, so the read is allowed
    // to fail outright rather than answer with an error shape.
    try {
      diff.receive(sides[i], await window.api.readFile(path))
    } catch {
      diff.showNotice(`Could not open "${String(path).split(/[\\/]/).pop()}".`)
    }
  }
}
