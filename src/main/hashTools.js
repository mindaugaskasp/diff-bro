// Tools menu: checksums (core in hashing.js). Thin by design — the renderer
// never names a path, it asks for a picker, exactly as the file-open path does,
// so this cannot become an arbitrary-file read.
import { basename } from 'node:path'
import { stat } from 'node:fs/promises'
import { dialog, ipcMain } from 'electron'
import { hashBuffer, hashFile } from './hashing'
import { t } from './i18n'

export function registerHashIpc() {
  ipcMain.handle('hash:text', (e, text) => {
    if (typeof text !== 'string') throw new Error('bad-request')
    return hashBuffer(Buffer.from(text, 'utf8'))
  })

  // The renderer never names the path — it asks for a picker, exactly as the
  // file-open path does, so this can't be turned into an arbitrary-file read.
  ipcMain.handle('hash:file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: t('dialog.checksumFile'),
      properties: ['openFile']
    })
    if (canceled || !filePaths.length) return { canceled: true }
    const path = filePaths[0]
    try {
      const { size } = await stat(path)
      return { name: basename(path), size, digests: await hashFile(path) }
    } catch (err) {
      return { error: err.message }
    }
  })
}
