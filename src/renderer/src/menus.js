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
        { sep: true },
        { label: 'Settings', keys: `${MOD}+,`, run: () => store.handleMenuAction('settings') },
        { sep: true },
        { label: 'Quit', run: () => window.api.quit() }
      ]
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { label: 'Swap Sides', keys: `${MOD}+Shift+S`, run: () => store.swap() },
        { label: 'Clear', keys: `${MOD}+K`, run: () => store.clear() },
        { sep: true },
        { label: 'Paste Text Mode', keys: `${MOD}+T`, run: () => store.togglePasteMode() }
      ]
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          label: 'Toggle Split View',
          keys: `${MOD}+\\`,
          run: () => store.handleMenuAction('toggle-split')
        },
        { label: 'Toggle Light/Dark Theme', keys: `${MOD}+D`, run: () => store.toggleTheme() },
        { sep: true },
        { label: 'Zoom In', keys: `${MOD}++`, run: () => window.api.zoom(1) },
        { label: 'Zoom Out', keys: `${MOD}+-`, run: () => window.api.zoom(-1) },
        { label: 'Reset Zoom', keys: `${MOD}+0`, run: () => window.api.zoom(0) },
        { sep: true, devOnly: true },
        { label: 'Toggle Developer Tools', devOnly: true, run: () => window.api.toggleDevTools() }
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
          items: [
            {
              label: 'Encode / Decode',
              keys: `${MOD}+Shift+B`,
              run: () => store.handleMenuAction('tools-base64')
            }
          ]
        },
        {
          label: 'JSON',
          items: [
            {
              label: 'Format / Validate',
              keys: `${MOD}+Shift+J`,
              run: () => store.handleMenuAction('tools-json')
            }
          ]
        },
        {
          label: 'XML',
          items: [
            {
              label: 'Format / Validate',
              keys: `${MOD}+Shift+M`,
              run: () => store.handleMenuAction('tools-xml')
            }
          ]
        },
        {
          label: 'SQL',
          items: [
            {
              label: 'Format / Validate',
              keys: `${MOD}+Shift+Q`,
              run: () => store.handleMenuAction('tools-sql')
            }
          ]
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
        { label: 'Keyboard Shortcuts', run: () => store.handleMenuAction('shortcuts') }
      ]
    }
  ]
}
