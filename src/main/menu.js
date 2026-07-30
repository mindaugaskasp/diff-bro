import { BrowserWindow, Menu, app, dialog, ipcMain, shell, systemPreferences } from 'electron'
import { toggleQuickLook } from './quickLook'

// Fixed in main so the renderer can trigger it but never supply a URL — no
// open-any-URL surface.
const ISSUE_URL = 'https://github.com/mindaugaskasp/diff-bro/issues/new'

// The one action that leaves the offline sandbox (hands the URL to the OS
// browser), so confirm first.
async function promptAndOpenIssue(win) {
  const parent = win ?? BrowserWindow.getFocusedWindow()
  const { response } = await dialog.showMessageBox(parent, {
    type: 'question',
    buttons: ['Cancel', 'Open in browser'],
    defaultId: 1,
    cancelId: 0,
    title: 'Report an Issue',
    message: 'Open the issue tracker in your browser?',
    detail: `Diff Bro itself stays offline. This opens your web browser (which does connect to the internet) at:\n\n${ISSUE_URL}`
  })
  if (response === 1) shell.openExternal(ISSUE_URL)
}

// Every accelerator here must have a twin in the renderer's MenuBar.vue
// (CLAUDE.md); this hidden native menu keeps the shortcuts working on Win/Linux.

function focusedWindow() {
  // Fall back to the first window: bare Xvfb reports no keyboard focus.
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

// Suppress AppKit's injected "Start Dictation" (a network service) and "Emoji &
// Symbols" via their user-default kill switches. (AutoFill / Writing Tools are
// also injected but ship no equivalent switch, so they can't be removed here.)
function disableInjectedMacMenuItems() {
  if (process.platform !== 'darwin') return
  systemPreferences.setUserDefault('NSDisabledDictationMenuItem', 'boolean', true)
  systemPreferences.setUserDefault('NSDisabledCharacterPaletteMenuItem', 'boolean', true)
}

export function installMenu() {
  const isMac = process.platform === 'darwin'
  disableInjectedMacMenuItems()
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
        { label: 'Export Diff as HTML…', click: () => sendToFocused('export-html') },
        { label: 'Import Snippets…', click: () => sendToFocused('import-snippets') },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => sendToFocused('settings') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        // macOS routes clipboard shortcuts through the app menu, so these roles
        // are required for text inputs to work; Chromium handles it elsewhere.
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
        {
          label: 'Copy Diff as Patch',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => sendToFocused('copy-diff')
        },
        { label: 'Apply Patch…', click: () => sendToFocused('apply-patch') },
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
          label: 'Command Palette…',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => sendToFocused('command-palette')
        },
        { type: 'separator' },
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
        {
          label: 'Quick Look-up',
          // User-configurable global shortcut (Settings), so no fixed hint here.
          click: () => toggleQuickLook()
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
        {
          label: 'Configuration',
          submenu: [
            { label: 'Back Up', click: () => sendToFocused('config-backup') },
            { label: 'Restore', click: () => sendToFocused('config-restore') }
          ]
        }
      ]
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Base64',
          submenu: [
            {
              label: 'Encode / Decode',
              accelerator: 'CmdOrCtrl+Shift+B',
              click: () => sendToFocused('tools-base64')
            }
          ]
        },
        {
          label: 'JSON',
          accelerator: 'CmdOrCtrl+Shift+J',
          click: () => sendToFocused('tools-json')
        },
        {
          label: 'XML',
          submenu: [
            {
              label: 'Format / Validate',
              accelerator: 'CmdOrCtrl+Shift+M',
              click: () => sendToFocused('tools-xml')
            }
          ]
        },
        {
          label: 'SQL',
          submenu: [
            {
              label: 'Format / Validate',
              accelerator: 'CmdOrCtrl+Shift+Q',
              click: () => sendToFocused('tools-sql')
            }
          ]
        },
        {
          label: 'UUID',
          accelerator: 'CmdOrCtrl+Shift+U',
          click: () => sendToFocused('tools-uuid')
        },
        { label: 'JWT Decode', click: () => sendToFocused('tools-jwt') },
        { label: 'Epoch / Date', click: () => sendToFocused('tools-epoch') },
        { label: 'URL Encode / Decode', click: () => sendToFocused('tools-url') },
        { label: 'HTML Entities', click: () => sendToFocused('tools-html') },
        { label: 'Sort & Dedupe Lines', click: () => sendToFocused('tools-lines') },
        {
          label: 'Find & Replace',
          submenu: [
            {
              label: 'Replace…',
              accelerator: 'CmdOrCtrl+Shift+R',
              click: () => sendToFocused('tools-find-replace')
            }
          ]
        },
        {
          label: 'Text Encryption',
          submenu: [
            {
              label: 'Encrypt / Decrypt',
              accelerator: 'CmdOrCtrl+Shift+X',
              click: () => sendToFocused('tools-crypt')
            }
          ]
        }
      ]
    },
    {
      role: 'help',
      label: 'Help',
      submenu: [
        // Installed version — the anchor for a future "Check for Updates…" item
        // that opens this tag's release page.
        { label: `Diff Bro v${app.getVersion()}`, enabled: false },
        { type: 'separator' },
        { label: 'Keyboard Shortcuts', click: () => sendToFocused('shortcuts') },
        { type: 'separator' },
        { label: 'Report an Issue', click: (_item, win) => promptAndOpenIssue(win) }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// DevTools access is dev-only: a no-op in packaged builds.
export function registerMenuIpc() {
  ipcMain.handle('app:toggleDevTools', (e) => {
    if (!app.isPackaged) e.sender.toggleDevTools()
  })
  ipcMain.handle('app:quit', () => app.quit())
  // Synchronous so the renderer can stamp the version into the window title and
  // the Help menu without an async round-trip (mirrors store:load).
  ipcMain.on('app:version', (e) => {
    e.returnValue = app.getVersion()
  })
  ipcMain.handle('app:reportIssue', (e) =>
    promptAndOpenIssue(BrowserWindow.fromWebContents(e.sender))
  )
  // Report packaged state so the renderer can hide dev-only menu entries.
  ipcMain.handle('app:isPackaged', () => app.isPackaged)
}
