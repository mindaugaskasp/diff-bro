import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'

contextBridge.exposeInMainWorld('api', {
  openFile: (side, format) => ipcRenderer.invoke('file:open', side, format),
  readClipboardFiles: () => ipcRenderer.invoke('clipboard:readFiles'),
  readFile: (path, opts) => ipcRenderer.invoke('file:read', path, opts),
  // `format` names a row of main's own export table; never an extension.
  exportDiffFile: (payload) => ipcRenderer.invoke('diff:exportFile', payload),
  // Streamed comparison: files too large to hold are indexed by line in main
  // and aligned over those digests. The renderer gets the alignment, then asks
  // for the line windows it is showing — the text never crosses whole.
  streamOpen: (leftPath, rightPath) => ipcRenderer.invoke('stream:open', { leftPath, rightPath }),
  streamLines: (payload) => ipcRenderer.invoke('stream:lines', payload),
  streamClose: (token) => ipcRenderer.invoke('stream:close', token),
  // Diff image export (saved diffs only): main screenshots the diff view itself,
  // so the picture carries the live theme and Monaco's highlighting. The bitmap
  // stays in main — the renderer only sends a rect and receives a preview URL.
  captureDiffImage: (rect) => ipcRenderer.invoke('image:capture', rect),
  // A diff taller than its pane is photographed a viewport at a time and joined
  // in main; the strips never come back across the boundary.
  appendDiffImageSlice: (rect, reset) => ipcRenderer.invoke('image:appendSlice', rect, reset),
  stitchDiffImage: () => ipcRenderer.invoke('image:stitch'),
  copyDiffImage: () => ipcRenderer.invoke('image:copy'),
  saveDiffImage: (name) => ipcRenderer.invoke('image:save', name),
  forgetDiffImage: () => ipcRenderer.invoke('image:forget'),
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
  // Decrypt-only raw-key interop (AES-256-CBC, unauthenticated); key is user input.
  decryptTextRaw: (payload) => ipcRenderer.invoke('crypto:decryptTextRaw', payload),
  // Sealed diff sharing (sign-then-encrypt, keys managed in main).
  listTrustedKeys: () => ipcRenderer.invoke('share:listTrusted'),
  myFingerprint: () => ipcRenderer.invoke('share:myFingerprint'),
  shareExport: (entry, recipientFps) => ipcRenderer.invoke('share:export', entry, recipientFps),
  shareImport: () => ipcRenderer.invoke('share:import'),
  // Drag-drop variant: import a sealed .diffbro dropped on the window, by path.
  shareImportPath: (path) => ipcRenderer.invoke('share:importPath', path),
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
  // A local delivery hint on a trusted key; '' clears it. Validated in main.
  setTrustedEmail: (fp, email) => ipcRenderer.invoke('share:setTrustedEmail', fp, email),
  // Key rotation. Retired keys stay on this machine as decrypt-only; no key
  // material crosses this boundary in either direction (rule 4).
  rotateKey: () => ipcRenderer.invoke('share:rotate'),
  retiredKeyCount: () => ipcRenderer.invoke('share:retiredCount'),
  destroyRetiredKeys: () => ipcRenderer.invoke('share:destroyRetired'),
  // Configuration backup/restore (passphrase-encrypted; identity keys stay
  // in the main process, only travelling inside the encrypted blob).
  backupConfig: (bundle, passphrase) => ipcRenderer.invoke('config:backup', bundle, passphrase),
  backupConfigTo: (bundle, passphrase, target) =>
    ipcRenderer.invoke('config:backupTo', bundle, passphrase, target),
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
  // No URL crosses from the renderer — only an error message for the prefilled
  // title, which main anonymises. The address itself is chosen in main.
  reportIssue: (title) => ipcRenderer.invoke('app:reportIssue', { title }),
  // Local error log (written by the main process, never sent anywhere). The
  // renderer forwards its own uncaught errors and can read/clear/reveal the log
  // and choose where it's stored.
  logError: (record) => ipcRenderer.invoke('log:error', record),
  readLog: () => ipcRenderer.invoke('log:read'),
  clearLog: () => ipcRenderer.invoke('log:clear'),
  revealLog: () => ipcRenderer.invoke('log:reveal'),
  logDirGet: () => ipcRenderer.invoke('log:getDir'),
  logDirChoose: () => ipcRenderer.invoke('log:chooseDir'),
  logDirReset: () => ipcRenderer.invoke('log:resetDir'),
  // Durable key/value store backed by files in the configurable data directory
  // (so data survives a reinstall). Loads are synchronous so the Pinia stores
  // can read their state during setup, exactly like localStorage did.
  storeLoad: (name) => ipcRenderer.sendSync('store:load', name),
  // The installed app version, resolved once at preload so the renderer has it
  // synchronously for the window title and Help menu.
  appVersion: ipcRenderer.sendSync('app:version'),
  storeSave: (name, contents) => ipcRenderer.invoke('store:save', name, contents),
  // Write/read the OS clipboard from the main process (navigator.clipboard is
  // blocked by the deny-all permission handler; see src/main/clipboard.js).
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  // Copy as file: BYTES and a display name, never a path — the renderer cannot
  // name a file for main to stage (src/main/clipboardCopy.js).
  copyAsFile: (name, content) => ipcRenderer.invoke('clipboard:writeFile', name, content),
  canCopyAsFile: () => ipcRenderer.invoke('clipboard:canWriteFile'),
  // Seal, then hand off to the OS mail client. No path and no URL crosses here.
  mailHandoff: (args) => ipcRenderer.invoke('mail:handoff', args),
  // Opens a stored link ONLY if main validates it as a claude.ai URL, after a
  // confirm dialog; any other URL is refused (see src/main/links.js).
  openLink: (url) => ipcRenderer.invoke('link:open', url),
  openClaudeLink: (url) => ipcRenderer.invoke('link:openClaude', url),
  readText: () => ipcRenderer.invoke('clipboard:read'),
  // Data-location settings.
  dataDirGet: () => ipcRenderer.invoke('datadir:get'),
  // The tour's demo pair, contents and all. Nothing is passed in.
  demoFiles: () => ipcRenderer.invoke('demo:files'),
  dataDirChoose: () => ipcRenderer.invoke('datadir:choose'),
  dataDirReset: () => ipcRenderer.invoke('datadir:reset'),
  dataDirReveal: () => ipcRenderer.invoke('datadir:reveal'),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  // App-menu actions (Open Left, Swap, …) arrive from the main process.
  // The `diffbro` terminal command. One-way, main → renderer, plus the shim
  // installer behind Settings; no key material and no paths the renderer chose.
  cliReady: () => ipcRenderer.send('cli:ready'),
  onCliCommand: (handler) => {
    ipcRenderer.on('cli:command', (_e, command) => handler(command))
  },
  cliStatus: () => ipcRenderer.invoke('cli:status'),
  cliInstall: () => ipcRenderer.invoke('cli:install'),
  cliRemove: () => ipcRenderer.invoke('cli:remove'),
  // Rolling local backups of snippets and kept diffs (src/main/autoBackup.js).
  listBackups: () => ipcRenderer.invoke('backup:list'),
  restoreBackup: (name) => ipcRenderer.invoke('backup:restore', name),
  pruneBackups: (days) => ipcRenderer.invoke('backup:prune', days),
  hashText: (text) => ipcRenderer.invoke('hash:text', text),
  hashFile: () => ipcRenderer.invoke('hash:file'),
  gitToolStatus: () => ipcRenderer.invoke('git:toolStatus'),
  gitToolRegister: () => ipcRenderer.invoke('git:register'),
  gitToolUnregister: () => ipcRenderer.invoke('git:unregister'),
  onMenuAction: (handler) => {
    ipcRenderer.on('menu:action', (_e, action) => handler(action))
  },
  // App-window fullscreen state changes (main pushes true/false). Read by the
  // Mermaid viewer so it can fill the window when the app goes fullscreen.
  onFullScreenChange: (handler) => {
    ipcRenderer.on('window:fullscreen', (_e, value) => handler(value))
  },
  // Quick look-up (the floating launcher window). The launcher renderer hides
  // itself (Esc) and hands a chosen result to the main window; the main-window
  // renderer receives that pick. Shared preload → both windows see these, but
  // each only wires the half it uses.
  quickLookToggle: () => ipcRenderer.invoke('quicklook:toggle'),
  // Settings → Shortcuts: apply a new summon accelerator live. Resolves to
  // { ok } or { ok:false, error } ('unavailable' / 'invalid').
  quickLookSetShortcut: (accel) => ipcRenderer.invoke('quicklook:setShortcut', accel),
  quickLookHide: () => ipcRenderer.invoke('quicklook:hide'),
  quickLookOpen: (payload) => ipcRenderer.invoke('quicklook:open', payload),
  // Launcher window: main signals a fresh summon so the list refreshes + the
  // input refocuses.
  onQuickLookShow: (handler) => {
    ipcRenderer.on('quicklook:show', () => handler())
  },
  // Main window: a result chosen in the launcher arrives here ({ kind, id }).
  onQuickLookOpen: (handler) => {
    ipcRenderer.on('quicklook:openInMain', (_e, payload) => handler(payload))
  }
})
