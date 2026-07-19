import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'

contextBridge.exposeInMainWorld('api', {
  openFile: (side) => ipcRenderer.invoke('file:open', side),
  readFile: (path, opts) => ipcRenderer.invoke('file:read', path, opts),
  // Electron >= 32: File objects in the renderer no longer expose .path,
  // so drag & drop must resolve paths through webUtils in the preload.
  getPathForFile: (file) => webUtils.getPathForFile(file),
  // Saved-diff vault crypto. All AES-GCM work happens in the main process;
  // the key never enters the renderer.
  vaultEncrypt: (plaintext, aad) => ipcRenderer.invoke('vault:encrypt', plaintext, aad),
  vaultDecrypt: (box, aad) => ipcRenderer.invoke('vault:decrypt', box, aad),
  // Tools menu: local passphrase-based text encrypt/decrypt (unrelated to
  // the vault above) — same main-process-only crypto rule applies.
  encryptText: (plaintext, passphrase, algorithm) =>
    ipcRenderer.invoke('crypto:encryptText', plaintext, passphrase, algorithm),
  decryptText: (blob, passphrase) => ipcRenderer.invoke('crypto:decryptText', blob, passphrase),
  // Sealed diff sharing (sign-then-encrypt, keys managed in main).
  listTrustedKeys: () => ipcRenderer.invoke('share:listTrusted'),
  myFingerprint: () => ipcRenderer.invoke('share:myFingerprint'),
  shareExport: (entry, recipientFp) => ipcRenderer.invoke('share:export', entry, recipientFp),
  shareImport: () => ipcRenderer.invoke('share:import'),
  exportPublicKey: () => ipcRenderer.invoke('share:exportPublicKey'),
  copyPublicKey: () => ipcRenderer.invoke('share:copyPublicKey'),
  addTrustedKey: () => ipcRenderer.invoke('share:addTrustedKey'),
  // Snippets export/import: passphrase-protected + signed, no recipient
  // setup needed (see snippetSealing.js).
  exportSnippets: (bundle, passphrase, defaultName) =>
    ipcRenderer.invoke('snippets:export', bundle, passphrase, defaultName),
  importSnippets: (passphrase) => ipcRenderer.invoke('snippets:import', passphrase),
  // Used by the custom in-app menu bar (Windows/Linux).
  zoom: (dir) => {
    if (dir === 0) {
      webFrame.setZoomLevel(0)
      return
    }
    // Clamp so zoom can't run away: roughly 60%–250% (each step is 0.5 of a
    // Chromium zoom level).
    const next = webFrame.getZoomLevel() + dir * 0.5
    webFrame.setZoomLevel(Math.min(Math.max(next, -2.5), 2.5))
  },
  toggleDevTools: () => ipcRenderer.invoke('app:toggleDevTools'),
  isPackaged: () => ipcRenderer.invoke('app:isPackaged'),
  quit: () => ipcRenderer.invoke('app:quit'),
  // App-menu actions (Open Left, Swap, …) arrive from the main process.
  onMenuAction: (handler) => {
    ipcRenderer.on('menu:action', (_e, action) => handler(action))
  }
})
