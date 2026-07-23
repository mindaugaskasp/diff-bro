import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'

contextBridge.exposeInMainWorld('api', {
  openFile: (side) => ipcRenderer.invoke('file:open', side),
  readFile: (path, opts) => ipcRenderer.invoke('file:read', path, opts),
  // Electron >= 32: File objects in the renderer no longer expose .path,
  // so drag & drop must resolve paths through webUtils in the preload.
  // Resolving here also registers the path with main as a genuine drop, so
  // `file:read` will serve it — a path the renderer invents never comes
  // through webUtils and stays unreadable (see files.js). IPC is FIFO, so
  // this registration lands before the renderer's subsequent read request.
  getPathForFile: (file) => {
    const path = webUtils.getPathForFile(file)
    if (path) ipcRenderer.invoke('file:allowDropPath', path)
    return path
  },
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
  myKeyLabel: () => ipcRenderer.invoke('share:myLabel'),
  exportPublicKey: (label) => ipcRenderer.invoke('share:exportPublicKey', label),
  copyPublicKey: (label) => ipcRenderer.invoke('share:copyPublicKey', label),
  addTrustedKey: () => ipcRenderer.invoke('share:addTrustedKey'),
  // Drag-drop key import: validate a .diffbrokey by path, then commit it
  // with a user-chosen name.
  readKeyFile: (path) => ipcRenderer.invoke('share:readKeyFile', path),
  addTrustedKeyNamed: (key, label) => ipcRenderer.invoke('share:addTrustedKeyNamed', key, label),
  renameTrusted: (fp, label) => ipcRenderer.invoke('share:renameTrusted', fp, label),
  removeTrusted: (fp) => ipcRenderer.invoke('share:removeTrusted', fp),
  // Configuration backup/restore (passphrase-encrypted; identity keys stay
  // in the main process, only travelling inside the encrypted blob).
  backupConfig: (snippets, settings, passphrase) =>
    ipcRenderer.invoke('config:backup', snippets, settings, passphrase),
  restoreConfig: (passphrase) => ipcRenderer.invoke('config:restore', passphrase),
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
  // Opens the project's "new issue" page (a fixed URL, chosen in main) in the
  // OS browser. No URL crosses from the renderer.
  reportIssue: () => ipcRenderer.invoke('app:reportIssue'),
  // Durable key/value store backed by files in the configurable data directory
  // (so data survives a reinstall). Loads are synchronous so the Pinia stores
  // can read their state during setup, exactly like localStorage did.
  storeLoad: (name) => ipcRenderer.sendSync('store:load', name),
  storeSave: (name, contents) => ipcRenderer.invoke('store:save', name, contents),
  // Write text to the OS clipboard from the main process (navigator.clipboard
  // is blocked by the deny-all permission handler; see src/main/clipboard.js).
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  // Data-location settings.
  dataDirGet: () => ipcRenderer.invoke('datadir:get'),
  dataDirChoose: () => ipcRenderer.invoke('datadir:choose'),
  dataDirReset: () => ipcRenderer.invoke('datadir:reset'),
  dataDirReveal: () => ipcRenderer.invoke('datadir:reveal'),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  // App-menu actions (Open Left, Swap, …) arrive from the main process.
  onMenuAction: (handler) => {
    ipcRenderer.on('menu:action', (_e, action) => handler(action))
  }
})
