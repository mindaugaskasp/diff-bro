import { ipcMain } from 'electron'
import { decryptText, encryptText } from './textCrypt'

// Tools menu: local passphrase text encrypt/decrypt (logic in textCrypt.js).
export function registerTextToolsIpc() {
  ipcMain.handle('crypto:encryptText', (e, plaintext, passphrase, algorithm) => {
    // Guard before the crypto core (rule 6).
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
