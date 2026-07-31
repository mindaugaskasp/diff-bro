import { MOD } from './keys'

// The in-app menu bar's contents (Windows/Linux). Kept out of MenuBar.vue so
// the component stays presentation: this is the list, that file is the
// dropdown behaviour.
//
// Every accelerator here must have a twin in the hidden application menu
// (src/main/menu.js) — that is what actually binds the shortcut.
export function buildMenus(store) {
  return [
    {
      id: 'file',
      label: 'File',
      items: [
        { label: 'Open Left', keys: `${MOD}+1`, run: () => store.handleMenuAction('open-left') },
        { label: 'Open Right', keys: `${MOD}+2`, run: () => store.handleMenuAction('open-right') },
        { sep: true },
        { label: 'Save', keys: `${MOD}+S`, run: () => store.handleMenuAction('save') },
        { label: 'Share', keys: `${MOD}+E`, run: () => store.shareCurrent() },
        { label: 'Import', keys: `${MOD}+I`, run: () => store.importShared() },
        { label: 'Export Diff as HTML…', run: () => store.handleMenuAction('export-html') },
        { label: 'Export Diff as Image…', run: () => store.handleMenuAction('export-image') },
        { sep: true },
        {
          label: 'New Comparison',
          keys: `${MOD}+Shift+T`,
          run: () => store.handleMenuAction('tab-new')
        },
        {
          label: 'Close Comparison',
          keys: `${MOD}+Shift+W`,
          run: () => store.handleMenuAction('tab-close')
        },
        {
          label: 'Next Comparison',
          keys: 'Ctrl+Tab',
          run: () => store.handleMenuAction('tab-next')
        },
        {
          label: 'Previous Comparison',
          keys: 'Ctrl+Shift+Tab',
          run: () => store.handleMenuAction('tab-prev')
        },
        { label: 'Import Snippets…', run: () => store.handleMenuAction('import-snippets') },
        { sep: true },
        { label: 'Settings', keys: `${MOD}+,`, run: () => store.handleMenuAction('settings') },
        { sep: true },
        { label: 'Quit', paletteHidden: true, run: () => window.api.quit() }
      ]
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { label: 'Swap Sides', keys: `${MOD}+Shift+S`, run: () => store.swap() },
        { label: 'Clear', keys: `${MOD}+K`, run: () => store.clear() },
        {
          label: 'Copy Diff as Patch',
          keys: `${MOD}+Shift+C`,
          run: () => store.handleMenuAction('copy-diff')
        },
        { label: 'Apply Patch…', run: () => store.handleMenuAction('apply-patch') },
        { sep: true },
        { label: 'Paste Text Mode', keys: `${MOD}+T`, run: () => store.togglePasteMode() }
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
          run: () => store.handleMenuAction('command-palette')
        },
        { sep: true },
        {
          label: 'Toggle Split View',
          keys: `${MOD}+\\`,
          run: () => store.handleMenuAction('toggle-split')
        },
        { label: 'Toggle Light/Dark Theme', keys: `${MOD}+D`, run: () => store.toggleTheme() },
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
      items: [
        { label: 'Share My Public Key', run: () => (store.showShareKeyDialog = true) },
        { sep: true },
        { label: 'Add Trusted Key', run: () => store.addTrustedKey() },
        { label: 'Manage Trusted Keys', run: () => store.handleMenuAction('manage-keys') },
        { sep: true },
        {
          label: 'Configuration',
          items: [
            { label: 'Back Up', run: () => store.handleMenuAction('config-backup') },
            { label: 'Restore', run: () => store.handleMenuAction('config-restore') }
          ]
        }
      ]
    },
    {
      id: 'tools',
      label: 'Tools',
      // Grouped by format (Tools → Base64 → …) to mirror the native menu.
      items: [
        {
          label: 'Base64',
          keys: `${MOD}+Shift+B`,
          run: () => store.handleMenuAction('tools-base64')
        },
        { label: 'JSON', keys: `${MOD}+Shift+J`, run: () => store.handleMenuAction('tools-json') },
        { label: 'XML', keys: `${MOD}+Shift+M`, run: () => store.handleMenuAction('tools-xml') },
        { label: 'UUID', keys: `${MOD}+Shift+U`, run: () => store.handleMenuAction('tools-uuid') },
        { label: 'JWT Decode', run: () => store.handleMenuAction('tools-jwt') },
        { label: 'Epoch / Date', run: () => store.handleMenuAction('tools-epoch') },
        { label: 'URL Encode / Decode', run: () => store.handleMenuAction('tools-url') },
        {
          label: 'Lines',
          keys: `${MOD}+Shift+R`,
          run: () => store.handleMenuAction('tools-lines')
        },
        {
          label: 'Text Encryption',
          items: [
            {
              label: 'Encrypt / Decrypt',
              keys: `${MOD}+Shift+X`,
              run: () => store.handleMenuAction('tools-crypt')
            }
          ]
        }
      ]
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        // Installed version — the anchor for a future "Check for Updates…" item
        // that opens this tag's release page. Mirrors the native menu.
        { label: `Diff Bro v${window.api.appVersion}`, info: true },
        { sep: true },
        { label: 'Keyboard Shortcuts', run: () => store.handleMenuAction('shortcuts') },
        { sep: true },
        { label: 'Report an Issue', run: () => window.api.reportIssue() }
      ]
    }
  ]
}
