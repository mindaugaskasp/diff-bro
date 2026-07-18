import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('api', {
  openFile: (side) => ipcRenderer.invoke('file:open', side),
  readFile: (path) => ipcRenderer.invoke('file:read', path),
  // Electron >= 32: File objects in the renderer no longer expose .path,
  // so drag & drop must resolve paths through webUtils in the preload.
  getPathForFile: (file) => webUtils.getPathForFile(file),
  // 256-bit AES key for the saved-diff vault (base64), managed in main.
  getVaultKey: () => ipcRenderer.invoke('vault:key'),
  // Sealed diff sharing (sign-then-encrypt, keys managed in main).
  listTrustedKeys: () => ipcRenderer.invoke('share:listTrusted'),
  shareExport: (entry, recipientFp) => ipcRenderer.invoke('share:export', entry, recipientFp),
  shareImport: () => ipcRenderer.invoke('share:import'),
  exportPublicKey: () => ipcRenderer.invoke('share:exportPublicKey'),
  addTrustedKey: () => ipcRenderer.invoke('share:addTrustedKey'),
  // App-menu actions (Open Left, Swap, …) arrive from the main process.
  onMenuAction: (handler) => {
    ipcRenderer.on('menu:action', (_e, action) => handler(action))
  }
})
