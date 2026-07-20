import { ipcMain } from 'electron'
import { decryptText, encryptText } from './textCrypt'

// Tools menu: local passphrase-based text encrypt/decrypt (scratch use,
// unrelated to the vault and share crypto). Pure logic lives in textCrypt.js;
// the passphrase never leaves this round trip and the app never persists it.
export function registerTextToolsIpc() {
  ipcMain.handle('crypto:encryptText', (e, plaintext, passphrase, algorithm) => {
    // Guard before the crypto core, which would otherwise throw across IPC on
    // non-string input from a compromised renderer (CLAUDE.md rule 6).
    if (typeof plaintext !== 'string' || typeof passphrase !== 'string' || !passphrase) {
      throw new Error('bad-request')
    }
    return encryptText(plaintext, passphrase, algorithm)
  })
  ipcMain.handle('crypto:decryptText', (e, blob, passphrase) => {
    if (typeof blob !== 'string' || typeof passphrase !== 'string') {
      return { ok: false, error: 'Not a valid encrypted blob.' }
    }
    return decryptText(blob, passphrase)
  })
}
