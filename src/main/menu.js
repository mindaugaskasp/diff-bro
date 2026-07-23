import { BrowserWindow, Menu, app, dialog, ipcMain, shell, systemPreferences } from 'electron'

// Where "Report an Issue" sends the user. The URL is fixed here in the main
// process — the renderer can ask to open it but can never pass a URL of its own,
// so this adds no open-any-URL surface. shell.openExternal hands the address to
// the OS browser; the app itself still makes no network request, so the offline
// guarantee (and the network kill switch, CSP, will-navigate block …) is intact.
const ISSUE_URL = 'https://github.com/mindaugaskasp/diff-bro/issues/new'

// Report an Issue is the one action that leaves the offline sandbox — it hands
// the fixed URL to the OS browser, which does connect to the internet. Confirm
// first so that departure is always the user's explicit choice, never a silent
// side effect of a menu click.
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

// AppKit injects "Start Dictation" and "Emoji & Symbols" into any menu titled
// "Edit". Both are dead ends here: dictation is a network service this app must
// never touch, and the character palette cannot insert into a sandboxed
// renderer, so it silently does nothing. Suppress them before the menu is built.
// AppKit also injects an "AutoFill" submenu (Passwords/Contacts) into text
// Edit menus on recent macOS. It is a dead end in a sandboxed, offline app —
// there is nothing to autofill and Passwords is a network-backed service this
// app must never touch — so suppress it alongside dictation and the palette.
function disableInjectedMacMenuItems() {
  if (process.platform !== 'darwin') return
  systemPreferences.setUserDefault('NSDisabledDictationMenuItem', 'boolean', true)
  systemPreferences.setUserDefault('NSDisabledCharacterPaletteMenuItem', 'boolean', true)
  systemPreferences.setUserDefault('NSDisabledAutoFillMenuItem', 'boolean', true)
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
        {
          label: 'Copy Diff as Patch',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => sendToFocused('copy-diff')
        },
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
      // Grouped by format so each tool's operations live under their own
      // heading (Tools → Base64 → …), leaving room to grow per format.
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
          submenu: [
            {
              label: 'Format / Validate',
              accelerator: 'CmdOrCtrl+Shift+J',
              click: () => sendToFocused('tools-json')
            }
          ]
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
        { label: 'Keyboard Shortcuts', click: () => sendToFocused('shortcuts') },
        { type: 'separator' },
        { label: 'Report an Issue', click: (_item, win) => promptAndOpenIssue(win) }
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
  // The custom menu bar (Windows/Linux) can't call shell itself. The URL is
  // fixed above; the renderer only triggers it, never chooses it — and the
  // confirm prompt still gates the actual browser launch.
  ipcMain.handle('app:reportIssue', (e) =>
    promptAndOpenIssue(BrowserWindow.fromWebContents(e.sender))
  )
  // Report packaged state so the renderer can hide dev-only menu entries.
  ipcMain.handle('app:isPackaged', () => app.isPackaged)
}
