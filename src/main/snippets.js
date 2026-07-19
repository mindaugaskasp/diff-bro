// Snippets export/import — Electron glue (file dialogs) around the pure
// crypto in snippetSealing.js. Reuses this install's identity (same keys as
// sealed diff sharing, see share.js) purely to sign the export; unlike
// sealed shares, import needs no trusted-peer setup — the passphrase is the
// only thing that gates decryption.
import { dialog, ipcMain } from 'electron'
import { readFile, stat, writeFile } from 'fs/promises'
import { getIdentity } from './share'
import { openSnippets, sealSnippets } from './snippetSealing'

// Reject absurdly large attacker-supplied files before JSON.parse.
const MAX_SNIPPET_FILE_BYTES = 64 * 1024 * 1024

export function registerSnippetIpc() {
  // bundle: { categories: [{ name, snippets: [{ name, content }] }] }
  ipcMain.handle('snippets:export', async (e, bundle, passphrase, defaultName) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export snippets',
      defaultPath: `${defaultName.replace(/[^\w.-]+/g, '_')}.diffbrosnip`,
      filters: [{ name: 'Diff Bro snippets', extensions: ['diffbrosnip'] }]
    })
    if (canceled || !filePath) return { canceled: true }

    const identity = await getIdentity()
    const file = sealSnippets(bundle, passphrase, identity)
    await writeFile(filePath, JSON.stringify(file, null, 2))
    return { ok: true, path: filePath }
  })

  ipcMain.handle('snippets:import', async (e, passphrase) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import snippets',
      properties: ['openFile'],
      filters: [{ name: 'Diff Bro snippets', extensions: ['diffbrosnip'] }]
    })
    if (canceled || !filePaths.length) return { canceled: true }

    let file
    try {
      const { size } = await stat(filePaths[0])
      if (size > MAX_SNIPPET_FILE_BYTES) return { error: 'not-a-snippet-file' }
      file = JSON.parse(await readFile(filePaths[0], 'utf-8'))
    } catch {
      return { error: 'not-a-snippet-file' }
    }

    return openSnippets(file, passphrase)
  })
}
