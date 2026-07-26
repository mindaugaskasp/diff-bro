import { MOD } from '../keys'

// The single source of truth for every keyboard shortcut the app advertises.
// Consumed by the Help → Keyboard Shortcuts dialog (full list, grouped) and the
// floating ShortcutBar (a short subset). The real bindings live in the hidden
// application menu (src/main/menu.js); this is only the labelling, so the labels
// track the host OS through MOD (Cmd on macOS, Ctrl elsewhere).
export const SHORTCUT_GROUPS = [
  {
    group: 'File',
    items: [
      { keys: `${MOD}+1`, label: 'Open left file' },
      { keys: `${MOD}+2`, label: 'Open right file' },
      { keys: `${MOD}+S`, label: 'Save diff' },
      { keys: `${MOD}+E`, label: 'Share diff' },
      { keys: `${MOD}+I`, label: 'Import shared diff' },
      { keys: `${MOD}+,`, label: 'Settings' }
    ]
  },
  {
    group: 'Edit',
    items: [
      { keys: `${MOD}+Shift+S`, label: 'Swap sides' },
      { keys: `${MOD}+K`, label: 'Clear' },
      { keys: `${MOD}+Shift+C`, label: 'Copy diff as patch' },
      { keys: `${MOD}+T`, label: 'Paste text mode' }
    ]
  },
  {
    group: 'View',
    items: [
      { keys: `${MOD}+\\`, label: 'Toggle split view' },
      { keys: `${MOD}+D`, label: 'Toggle light/dark theme' },
      { keys: `${MOD}++`, label: 'Zoom in' },
      { keys: `${MOD}+-`, label: 'Zoom out' },
      { keys: `${MOD}+0`, label: 'Reset zoom' }
    ]
  },
  {
    group: 'Tools',
    items: [
      { keys: `${MOD}+Shift+B`, label: 'Base64 encode / decode' },
      { keys: `${MOD}+Shift+J`, label: 'JSON format / validate' },
      { keys: `${MOD}+Shift+M`, label: 'XML format / validate' },
      { keys: `${MOD}+Shift+Q`, label: 'SQL format / validate' },
      { keys: `${MOD}+Shift+R`, label: 'Find & replace' },
      { keys: `${MOD}+Shift+X`, label: 'Encrypt / decrypt text' }
    ]
  }
]

// The compact set shown in the floating hint bar over the diff area.
export const SHORTCUT_BAR = [
  [`${MOD}+1`, 'open left'],
  [`${MOD}+2`, 'open right'],
  [`${MOD}+S`, 'save diff'],
  [`${MOD}+Shift+S`, 'swap'],
  [`${MOD}+T`, 'paste text'],
  [`${MOD}+\\`, 'split view'],
  [`${MOD}+K`, 'clear']
]
