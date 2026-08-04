// The Security menu's items, lifted out of buildMenus, which is at its size cap.
// `run` is passed in so this stays a plain data builder with no store reach.

/** @param {(action: string) => void} run */
export const securityItems = (run) => [
  { label: 'Share My Public Key', run: () => run('export-pubkey') },
  { sep: true },
  { label: 'Add Trusted Key', run: () => run('add-trusted-key') },
  { label: 'Manage Trusted Keys', run: () => run('manage-keys') },
  { label: 'Replace My Key…', run: () => run('rotate-key') },
  { sep: true },
  {
    label: 'Configuration',
    items: [
      { label: 'Back Up', run: () => run('config-backup') },
      { label: 'Restore', run: () => run('config-restore') }
    ]
  }
]
