import { BrowserWindow, Menu, app, ipcMain } from 'electron'

// --- App menu: file actions forwarded to the renderer over IPC ---
//
// Every accelerator here must have a twin in the renderer's MenuBar.vue
// (CLAUDE.md): the native menu is hidden on Windows/Linux but stays installed
// so its shortcuts keep working.

function focusedWindow() {
  // Fall back to the first window: under bare Xvfb (Docker test env, no
  // window manager) no window ever reports keyboard focus.
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

function sendToFocused(action) {
  focusedWindow()?.webContents.send('menu:action', action)
}

// Clamped zoom (roughly 60%–250%) so it can never run away.
const ZOOM_MIN = -2.5
const ZOOM_MAX = 2.5
function zoomBy(delta) {
  const wc = focusedWindow()?.webContents
  if (!wc) return
  wc.setZoomLevel(Math.min(Math.max(wc.getZoomLevel() + delta, ZOOM_MIN), ZOOM_MAX))
}
function resetZoom() {
  const wc = focusedWindow()?.webContents
  if (wc) wc.setZoomLevel(0)
}

export function installMenu() {
  const isMac = process.platform === 'darwin'
  // DevTools (and its accelerator) ship only in development builds.
  const isDev = !app.isPackaged
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Left',
          accelerator: 'CmdOrCtrl+1',
          click: () => sendToFocused('open-left')
        },
        {
          label: 'Open Right',
          accelerator: 'CmdOrCtrl+2',
          click: () => sendToFocused('open-right')
        },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendToFocused('save') },
        { label: 'Share', accelerator: 'CmdOrCtrl+E', click: () => sendToFocused('share-current') },
        {
          label: 'Import',
          accelerator: 'CmdOrCtrl+I',
          click: () => sendToFocused('import-shared')
        },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => sendToFocused('settings') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        // macOS routes clipboard shortcuts (Cmd+C/V/X/A) through the app menu:
        // without these roles, Cmd+V does nothing in text inputs (e.g. the
        // snippet editor). Windows/Linux get clipboard from Chromium directly,
        // and this native menu is hidden there, so the roles are macOS-only.
        ...(isMac
          ? [
              { role: 'undo' },
              { role: 'redo' },
              { type: 'separator' },
              { role: 'cut' },
              { role: 'copy' },
              { role: 'paste' },
              { role: 'selectAll' },
              { type: 'separator' }
            ]
          : []),
        {
          label: 'Swap Sides',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendToFocused('swap')
        },
        { label: 'Clear', accelerator: 'CmdOrCtrl+K', click: () => sendToFocused('clear') },
        { type: 'separator' },
        {
          label: 'Paste Text Mode',
          accelerator: 'CmdOrCtrl+T',
          click: () => sendToFocused('toggle-paste')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Split View',
          accelerator: 'CmdOrCtrl+\\',
          click: () => sendToFocused('toggle-split')
        },
        {
          label: 'Toggle Light/Dark Theme',
          accelerator: 'CmdOrCtrl+D',
          click: () => sendToFocused('toggle-theme')
        },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => zoomBy(0.5) },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => zoomBy(-0.5) },
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', click: resetZoom },
        ...(isDev ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : [])
      ]
    },
    {
      label: 'Security',
      submenu: [
        { label: 'Share My Public Key', click: () => sendToFocused('export-pubkey') },
        { type: 'separator' },
        { label: 'Add Trusted Key', click: () => sendToFocused('add-trusted-key') },
        { label: 'Manage Trusted Keys', click: () => sendToFocused('manage-keys') },
        { type: 'separator' },
        { label: 'Back Up Configuration', click: () => sendToFocused('config-backup') },
        { label: 'Restore Configuration', click: () => sendToFocused('config-restore') }
      ]
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Base64 Encode/Decode',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => sendToFocused('tools-base64')
        },
        {
          label: 'JSON Format/Validate',
          accelerator: 'CmdOrCtrl+Shift+J',
          click: () => sendToFocused('tools-json')
        },
        {
          label: 'XML Format/Validate',
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => sendToFocused('tools-xml')
        },
        {
          label: 'SQL Format/Validate',
          accelerator: 'CmdOrCtrl+Shift+Q',
          click: () => sendToFocused('tools-sql')
        },
        {
          label: 'Encrypt/Decrypt Text',
          accelerator: 'CmdOrCtrl+Shift+X',
          click: () => sendToFocused('tools-crypt')
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// The custom in-app menu bar (Windows/Linux) cannot reach these two itself.
// DevTools access is dev-only: in a packaged build the handler is a no-op so
// the renderer can never open DevTools.
export function registerMenuIpc() {
  ipcMain.handle('app:toggleDevTools', (e) => {
    if (!app.isPackaged) e.sender.toggleDevTools()
  })
  ipcMain.handle('app:quit', () => app.quit())
  // Report packaged state so the renderer can hide dev-only menu entries.
  ipcMain.handle('app:isPackaged', () => app.isPackaged)
}
