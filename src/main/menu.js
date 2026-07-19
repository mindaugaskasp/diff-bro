import { BrowserWindow, Menu, app, ipcMain } from 'electron'

// --- App menu: file actions forwarded to the renderer over IPC ---
//
// Every accelerator here must have a twin in the renderer's MenuBar.vue
// (CLAUDE.md): the native menu is hidden on Windows/Linux but stays installed
// so its shortcuts keep working.

function sendToFocused(action) {
  // Fall back to the first window: under bare Xvfb (Docker test env, no
  // window manager) no window ever reports keyboard focus.
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  win?.webContents.send('menu:action', action)
}

export function installMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Left…',
          accelerator: 'CmdOrCtrl+1',
          click: () => sendToFocused('open-left')
        },
        {
          label: 'Open Right…',
          accelerator: 'CmdOrCtrl+2',
          click: () => sendToFocused('open-right')
        },
        { type: 'separator' },
        { label: 'Save Diff…', accelerator: 'CmdOrCtrl+S', click: () => sendToFocused('save') },
        {
          label: 'Share Diff…',
          accelerator: 'CmdOrCtrl+E',
          click: () => sendToFocused('share-current')
        },
        { type: 'separator' },
        {
          label: 'Import Shared Diff…',
          accelerator: 'CmdOrCtrl+I',
          click: () => sendToFocused('import-shared')
        },
        { label: 'Copy My Public Key', click: () => sendToFocused('copy-pubkey') },
        { label: 'Export My Public Key…', click: () => sendToFocused('export-pubkey') },
        { label: 'Add Trusted Key…', click: () => sendToFocused('add-trusted-key') },
        { type: 'separator' },
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
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
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
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Base64 Encode/Decode…',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => sendToFocused('tools-base64')
        },
        {
          label: 'JSON Format/Validate…',
          accelerator: 'CmdOrCtrl+Shift+J',
          click: () => sendToFocused('tools-json')
        },
        {
          label: 'XML Format/Validate…',
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => sendToFocused('tools-xml')
        },
        {
          label: 'Encrypt/Decrypt Text…',
          accelerator: 'CmdOrCtrl+Shift+X',
          click: () => sendToFocused('tools-crypt')
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// The custom in-app menu bar (Windows/Linux) cannot reach these two itself.
export function registerMenuIpc() {
  ipcMain.handle('app:toggleDevTools', (e) => e.sender.toggleDevTools())
  ipcMain.handle('app:quit', () => app.quit())
}
