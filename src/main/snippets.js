// Snippets export/import — Electron glue around snippetSealing.js. Signs with
// this install's identity; import is gated only by the passphrase (no peer setup).
import { dialog, ipcMain } from 'electron'
import { readFile, stat, writeFile } from 'fs/promises'
import { getIdentity } from './share'
import { openSnippets, sealSnippets } from './snippetSealing'

// Reject absurdly large attacker-supplied files before JSON.parse.
const MAX_SNIPPET_FILE_BYTES = 64 * 1024 * 1024

export function registerSnippetIpc() {
  ipcMain.handle('snippets:export', async (e, bundle, passphrase, defaultName) => {
    // Guard the shapes a compromised renderer could send (rule 6).
    if (typeof passphrase !== 'string' || !passphrase || !bundle || typeof bundle !== 'object') {
      return { error: 'bad-request' }
    }
    const safeName =
      typeof defaultName === 'string' && defaultName ? defaultName : 'diffbro-snippets'
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export snippets',
      defaultPath: `${safeName.replace(/[^\w.-]+/g, '_')}.diffbrosnip`,
      filters: [{ name: 'Diff Bro snippets', extensions: ['diffbrosnip'] }]
    })
    if (canceled || !filePath) return { canceled: true }

    const identity = await getIdentity()
    const file = await sealSnippets(bundle, passphrase, identity)
    await writeFile(filePath, JSON.stringify(file, null, 2))
    return { ok: true, path: filePath }
  })

  ipcMain.handle('snippets:import', async (e, passphrase) => {
    if (typeof passphrase !== 'string' || !passphrase) return { error: 'wrong-passphrase' }
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

    return await openSnippets(file, passphrase)
  })
}
