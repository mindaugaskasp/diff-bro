import { MOD } from './keys'
import { securityItems } from './menuSecurity'

// The in-app menu bar's contents (Windows/Linux). Kept out of MenuBar.vue so
// the component stays presentation: this is the list, that file is the
// dropdown behaviour.
//
// Every accelerator here must have a twin in the hidden application menu
// (src/main/menu.js) — that is what actually binds the shortcut.
//
// Declarative: an item names an action, it never calls a store. `run` comes
// from useCommands, and commands.test.js fails if a name here resolves to
// nothing.
export function buildMenus(run) {
  return [
    {
      id: 'file',
      label: 'File',
      items: [
        { label: 'Open Left', keys: `${MOD}+1`, run: () => run('open-left') },
        { label: 'Open Right', keys: `${MOD}+2`, run: () => run('open-right') },
        { sep: true },
        { label: 'Save', keys: `${MOD}+S`, run: () => run('save') },
        { label: 'Share', keys: `${MOD}+E`, run: () => run('share-current') },
        { label: 'Import', keys: `${MOD}+I`, run: () => run('import-shared') },
        { label: 'Export Diff as HTML…', run: () => run('export-html') },
        { label: 'Export Diff as Image…', run: () => run('export-image') },
        { sep: true },
        {
          label: 'New Comparison',
          keys: `${MOD}+Shift+T`,
          run: () => run('tab-new')
        },
        {
          label: 'Close Comparison',
          keys: `${MOD}+Shift+W`,
          run: () => run('tab-close')
        },
        {
          label: 'Next Comparison',
          keys: 'Ctrl+Tab',
          run: () => run('tab-next')
        },
        {
          label: 'Previous Comparison',
          keys: 'Ctrl+Shift+Tab',
          run: () => run('tab-prev')
        },
        { label: 'Import Snippets…', run: () => run('import-snippets') },
        { sep: true },
        { label: 'Settings', keys: `${MOD}+,`, run: () => run('settings') },
        { sep: true },
        { label: 'Quit', paletteHidden: true, run: () => window.api.quit() }
      ]
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { label: 'Swap Sides', keys: `${MOD}+Shift+S`, run: () => run('swap') },
        { label: 'Clear', keys: `${MOD}+K`, run: () => run('clear') },
        {
          label: 'Copy Diff as Patch',
          keys: `${MOD}+Shift+C`,
          run: () => run('copy-diff')
        },
        {
          label: 'Copy Diff as File',
          keys: `${MOD}+Shift+F`,
          run: () => run('copy-diff-file')
        },
        { label: 'Apply Patch…', run: () => run('apply-patch') },
        { sep: true },
        { label: 'Paste Text Mode', keys: `${MOD}+T`, run: () => run('toggle-paste') }
      ]
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          label: 'Command Palette…',
          keys: `${MOD}+Shift+P`,
          paletteHidden: true,
          run: () => run('command-palette')
        },
        { sep: true },
        {
          label: 'Toggle Structure View',
          keys: `${MOD}+Shift+D`,
          run: () => run('toggle-structure')
        },
        {
          label: 'Toggle Split View',
          keys: `${MOD}+\\`,
          run: () => run('toggle-split')
        },
        {
          label: 'Toggle Sidebar',
          keys: `${MOD}+B`,
          run: () => run('toggle-sidebar')
        },
        { label: 'Toggle Light/Dark Theme', keys: `${MOD}+D`, run: () => run('toggle-theme') },
        { sep: true },
        {
          // No key hint: the binding is user-configurable (Settings →
          // Shortcuts), so a fixed label here would go stale once rebound.
          label: 'Quick Look-up',
          run: () => window.api.quickLookToggle()
        },
        { sep: true },
        { label: 'Zoom In', keys: `${MOD}++`, paletteHidden: true, run: () => window.api.zoom(1) },
        {
          label: 'Zoom Out',
          keys: `${MOD}+-`,
          paletteHidden: true,
          run: () => window.api.zoom(-1)
        },
        {
          label: 'Reset Zoom',
          keys: `${MOD}+0`,
          paletteHidden: true,
          run: () => window.api.zoom(0)
        },
        { sep: true, devOnly: true },
        {
          label: 'Toggle Developer Tools',
          devOnly: true,
          paletteHidden: true,
          run: () => window.api.toggleDevTools()
        }
      ]
    },
    {
      id: 'security',
      label: 'Security',
      items: securityItems(run)
    },
    {
      id: 'tools',
      label: 'Tools',
      // Grouped by format (Tools → Base64 → …) to mirror the native menu.
      items: [
        {
          label: 'Base64',
          keys: `${MOD}+Shift+B`,
          run: () => run('tools-base64')
        },
        { label: 'JSON', keys: `${MOD}+Shift+J`, run: () => run('tools-json') },
        { label: 'XML', keys: `${MOD}+Shift+M`, run: () => run('tools-xml') },
        { label: 'UUID', keys: `${MOD}+Shift+U`, run: () => run('tools-uuid') },
        { label: 'JWT Decode', run: () => run('tools-jwt') },
        { label: 'Epoch / Date', run: () => run('tools-epoch') },
        { label: 'URL Encode / Decode', run: () => run('tools-url') },
        {
          label: 'Checksum / Hash',
          run: () => run('tools-hash')
        },
        {
          label: 'Regex Tester',
          run: () => run('tools-regex')
        },
        {
          label: 'Lines',
          keys: `${MOD}+Shift+R`,
          run: () => run('tools-lines')
        },
        {
          label: 'Text Encryption',
          items: [
            {
              label: 'Encrypt / Decrypt',
              keys: `${MOD}+Shift+X`,
              run: () => run('tools-crypt')
            }
          ]
        }
      ]
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        // Mirrors the native menu; anchor for a future "Check for Updates…".
        { label: `Diff Bro v${window.api.appVersion}`, info: true },
        { sep: true },
        { label: 'Keyboard Shortcuts', run: () => run('shortcuts') },
        { label: 'Show Tour', run: () => run('show-tour') },
        { sep: true },
        { label: 'Report an Issue', run: () => window.api.reportIssue() }
      ]
    }
  ]
}
