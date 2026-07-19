import { ipcMain } from 'electron'
import { decryptText, encryptText } from './textCrypt'

// Tools menu: local passphrase-based text encrypt/decrypt (scratch use,
// unrelated to the vault and share crypto). Pure logic lives in textCrypt.js;
// the passphrase never leaves this round trip and the app never persists it.
export function registerTextToolsIpc() {
  ipcMain.handle('crypto:encryptText', (e, plaintext, passphrase, algorithm) =>
    encryptText(plaintext, passphrase, algorithm)
  )
  ipcMain.handle('crypto:decryptText', (e, blob, passphrase) => decryptText(blob, passphrase))
}
