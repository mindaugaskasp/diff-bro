// Menu sections lifted out of installMenu, which is at its size cap. `send` is
// passed in rather than imported so this file stays free of window/focus logic
// — menu.js owns which window an action reaches.

/** @param {(action: string) => void} send */
export const securityMenu = (send) => ({
  label: 'Security',
  submenu: [
    { label: 'Share My Public Key', click: () => send('export-pubkey') },
    { type: 'separator' },
    { label: 'Add Trusted Key', click: () => send('add-trusted-key') },
    { label: 'Manage Trusted Keys', click: () => send('manage-keys') },
    { label: 'Replace My Key…', click: () => send('rotate-key') },
    { type: 'separator' },
    {
      label: 'Configuration',
      submenu: [
        { label: 'Back Up', click: () => send('config-backup') },
        { label: 'Restore', click: () => send('config-restore') }
      ]
    }
  ]
})
