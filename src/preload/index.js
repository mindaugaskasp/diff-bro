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
  // Sealed diff sharing (sign-then-encrypt, keys managed in main).
  listTrustedKeys: () => ipcRenderer.invoke('share:listTrusted'),
  myFingerprint: () => ipcRenderer.invoke('share:myFingerprint'),
  shareExport: (entry, recipientFp) => ipcRenderer.invoke('share:export', entry, recipientFp),
  shareImport: () => ipcRenderer.invoke('share:import'),
  exportPublicKey: () => ipcRenderer.invoke('share:exportPublicKey'),
  addTrustedKey: () => ipcRenderer.invoke('share:addTrustedKey'),
  // Used by the custom in-app menu bar (Windows/Linux).
  zoom: (dir) => {
    if (dir === 0) webFrame.setZoomLevel(0)
    else webFrame.setZoomLevel(webFrame.getZoomLevel() + dir * 0.5)
  },
  toggleDevTools: () => ipcRenderer.invoke('app:toggleDevTools'),
  quit: () => ipcRenderer.invoke('app:quit'),
  // App-menu actions (Open Left, Swap, …) arrive from the main process.
  onMenuAction: (handler) => {
    ipcRenderer.on('menu:action', (_e, action) => handler(action))
  }
})
