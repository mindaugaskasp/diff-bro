import { MOD } from '../keys'

// The single source of truth for every keyboard shortcut the app advertises.
// Consumed by the Help → Keyboard Shortcuts dialog (full list, grouped) and the
// floating ShortcutBar (a short subset). The real bindings live in the hidden
// application menu (src/main/menu.js); this is only the labelling, so the labels
// track the host OS through MOD (Cmd on macOS, Ctrl elsewhere).
//
// Labels are catalogue KEYS, not text: utils/ is pure and cannot import Vue, and
// a string resolved here at module load would never follow a language change.
// The consumers translate them. `id` is what code compares against — the label
// is for people and moves with the locale.
export const SHORTCUT_GROUPS = [
  {
    id: 'file',
    labelKey: 'shortcuts.group.file',
    items: [
      { keys: `${MOD}+1`, labelKey: 'shortcuts.openLeft' },
      { keys: `${MOD}+2`, labelKey: 'shortcuts.openRight' },
      { keys: `${MOD}+S`, labelKey: 'shortcuts.saveDiff' },
      { keys: `${MOD}+E`, labelKey: 'shortcuts.shareDiff' },
      { keys: `${MOD}+I`, labelKey: 'shortcuts.importShared' },
      { keys: `${MOD}+,`, labelKey: 'shortcuts.settings' }
    ]
  },
  {
    id: 'comparisons',
    labelKey: 'shortcuts.group.comparisons',
    items: [
      { keys: `${MOD}+Shift+T`, labelKey: 'shortcuts.newComparison' },
      { keys: `${MOD}+Shift+W`, labelKey: 'shortcuts.closeComparison' },
      { keys: 'Ctrl+Tab', labelKey: 'shortcuts.nextComparison' },
      { keys: 'Ctrl+Shift+Tab', labelKey: 'shortcuts.prevComparison' }
    ]
  },
  {
    id: 'edit',
    labelKey: 'shortcuts.group.edit',
    items: [
      { keys: `${MOD}+Shift+S`, labelKey: 'shortcuts.swapSides' },
      { keys: `${MOD}+K`, labelKey: 'shortcuts.clear' },
      { keys: `${MOD}+Shift+C`, labelKey: 'shortcuts.copyPatch' },
      { keys: `${MOD}+Shift+F`, labelKey: 'shortcuts.copyFile' },
      { keys: `${MOD}+T`, labelKey: 'shortcuts.pasteTextMode' },
      { keys: `${MOD}+V`, labelKey: 'shortcuts.pasteToCompare' }
    ]
  },
  {
    id: 'view',
    labelKey: 'shortcuts.group.view',
    items: [
      { keys: `${MOD}+Shift+P`, labelKey: 'shortcuts.commandPalette' },
      { keys: `${MOD}+\\`, labelKey: 'shortcuts.toggleSplit' },
      { keys: `${MOD}+B`, labelKey: 'shortcuts.toggleSidebar' },
      { keys: `${MOD}+Shift+D`, labelKey: 'shortcuts.toggleStructure' },
      { keys: `${MOD}+Shift+K`, labelKey: 'shortcuts.mergeConflicts' },
      { keys: `${MOD}+D`, labelKey: 'shortcuts.toggleTheme' },
      { keys: `${MOD}++`, labelKey: 'shortcuts.zoomIn' },
      { keys: `${MOD}+-`, labelKey: 'shortcuts.zoomOut' },
      { keys: `${MOD}+0`, labelKey: 'shortcuts.resetZoom' }
    ]
  },
  {
    id: 'tools',
    labelKey: 'shortcuts.group.tools',
    items: [
      { keys: `${MOD}+Shift+B`, labelKey: 'shortcuts.base64' },
      { keys: `${MOD}+Shift+J`, labelKey: 'shortcuts.json' },
      { keys: `${MOD}+Shift+M`, labelKey: 'shortcuts.xml' },
      { keys: `${MOD}+Shift+U`, labelKey: 'shortcuts.uuid' },
      { keys: `${MOD}+Shift+R`, labelKey: 'shortcuts.lines' },
      { keys: `${MOD}+Shift+X`, labelKey: 'shortcuts.crypt' }
    ]
  }
]

// The compact set shown in the floating hint bar over the diff area. Objects
// rather than tuples so scripts/check-i18n.mjs can see the keys are in use.
export const SHORTCUT_BAR = [
  { keys: `${MOD}+1`, labelKey: 'shortcuts.bar.openLeft' },
  { keys: `${MOD}+2`, labelKey: 'shortcuts.bar.openRight' },
  { keys: `${MOD}+S`, labelKey: 'shortcuts.bar.saveDiff' },
  { keys: `${MOD}+Shift+S`, labelKey: 'shortcuts.bar.swap' },
  { keys: `${MOD}+T`, labelKey: 'shortcuts.bar.pasteText' },
  { keys: `${MOD}+\\`, labelKey: 'shortcuts.bar.splitView' },
  { keys: `${MOD}+K`, labelKey: 'shortcuts.bar.clear' }
]
