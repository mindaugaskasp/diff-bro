import { BrowserWindow, Menu, app, dialog, ipcMain, shell, systemPreferences } from 'electron'
import { homedir } from 'os'
import { ISSUE_BASE, buildIssueUrl } from './issueUrl'
import { isLauncher, toggleQuickLook } from './quickLook'
import { securityMenu } from './menuSections'

// Leaves the offline sandbox, so confirm first — showing the prefill, since
// this is the moment that text stops being local.
async function promptAndOpenIssue(win, title) {
  const parent = win ?? BrowserWindow.getFocusedWindow()
  const url = buildIssueUrl({
    title,
    appVersion: app.getVersion(),
    platform: `${process.platform} ${process.arch}`,
    homeDir: homedir()
  })
  const prefilled = new URL(url).searchParams.get('title')
  const detail = [
    `Diff Bro itself stays offline. This opens your web browser (which does connect to the internet) at:\n\n${ISSUE_BASE}`,
    prefilled && `\n\nPrefilled title:\n\n${prefilled}`,
    '\n\nYou review and submit the issue yourself; nothing is sent from the app.'
  ]
    .filter(Boolean)
    .join('')
  const { response } = await dialog.showMessageBox(parent, {
    type: 'question',
    buttons: ['Cancel', 'Open in browser'],
    defaultId: 1,
    cancelId: 0,
    title: 'Report an Issue',
    message: 'Open the issue tracker in your browser?',
    detail
  })
  if (response === 1) shell.openExternal(url)
}

// Every accelerator here must have a twin in the renderer's MenuBar.vue
// (docs/standards.md); this hidden native menu keeps the shortcuts working on Win/Linux.

function focusedWindow() {
  // Fall back to the first window: bare Xvfb reports no keyboard focus.
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

// Menu actions act on the DOCUMENT, which only the main window has. With the
// launcher up it is the focused window, so ⌘S/⌘K/⌘1 used to go to a renderer
// that has no handler for them and silently do nothing.
function documentWindow() {
  const focused = focusedWindow()
  if (!isLauncher(focused)) return focused
  return BrowserWindow.getAllWindows().find((w) => !isLauncher(w)) ?? null
}

function sendToFocused(action) {
  documentWindow()?.webContents.send('menu:action', action)
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
        { label: 'Export Diff as Image…', click: () => sendToFocused('export-image') },
        { type: 'separator' },
        {
          label: 'New Comparison',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => sendToFocused('tab-new')
        },
        {
          label: 'Close Comparison',
          accelerator: 'CmdOrCtrl+Shift+W',
          click: () => sendToFocused('tab-close')
        },
        {
          label: 'Next Comparison',
          accelerator: 'Ctrl+Tab',
          click: () => sendToFocused('tab-next')
        },
        {
          label: 'Previous Comparison',
          accelerator: 'Ctrl+Shift+Tab',
          click: () => sendToFocused('tab-prev')
        },
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
          label: 'Copy Diff as Text',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => sendToFocused('copy-diff')
        },
        {
          label: 'Copy Diff as File',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => sendToFocused('copy-diff-file')
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
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => sendToFocused('toggle-sidebar')
        },
        { type: 'separator' },
        {
          label: 'Toggle Structure View',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => sendToFocused('toggle-structure')
        },
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
    securityMenu(sendToFocused),
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Base64',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => sendToFocused('tools-base64')
        },
        {
          label: 'JSON',
          accelerator: 'CmdOrCtrl+Shift+J',
          click: () => sendToFocused('tools-json')
        },
        {
          label: 'XML',
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => sendToFocused('tools-xml')
        },
        {
          label: 'UUID',
          accelerator: 'CmdOrCtrl+Shift+U',
          click: () => sendToFocused('tools-uuid')
        },
        { label: 'JWT Decode', click: () => sendToFocused('tools-jwt') },
        { label: 'Epoch / Date', click: () => sendToFocused('tools-epoch') },
        { label: 'URL Encode / Decode', click: () => sendToFocused('tools-url') },
        {
          label: 'Lines',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => sendToFocused('tools-lines')
        },
        { label: 'Checksum / Hash', click: () => sendToFocused('tools-hash') },
        { label: 'Regex Tester', click: () => sendToFocused('tools-regex') },
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
  // Untrusted: only a title is read, and buildIssueUrl anonymises and encodes it.
  ipcMain.handle('app:reportIssue', (e, payload = {}) =>
    promptAndOpenIssue(BrowserWindow.fromWebContents(e.sender), payload?.title)
  )
  // Report packaged state so the renderer can hide dev-only menu entries.
  ipcMain.handle('app:isPackaged', () => app.isPackaged)
}
