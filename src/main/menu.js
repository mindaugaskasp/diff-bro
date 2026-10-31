import { BrowserWindow, Menu, app, dialog, ipcMain, shell, systemPreferences } from 'electron'
import { homedir } from 'os'
import { ISSUE_BASE, buildIssueUrl } from './issueUrl'
import { isLauncher, toggleQuickLook } from './quickLook'
import { editMenu, helpMenu, securityMenu, toolsMenu } from './menuSections'
import { setLocale, t } from './i18n'
import { refreshTrayMenu } from './tray'

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
    t('reportIssue.leavesApp', { url: ISSUE_BASE }),
    prefilled && t('reportIssue.prefilledTitle', { title: prefilled }),
    t('reportIssue.youSubmit')
  ]
    .filter(Boolean)
    .join('')
  const { response } = await dialog.showMessageBox(parent, {
    type: 'question',
    buttons: [t('common.cancel'), t('reportIssue.openInBrowser')],
    defaultId: 1,
    cancelId: 0,
    title: t('reportIssue.title'),
    message: t('reportIssue.message'),
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

// Zoom scales the COMPARISON, never the window: setZoomLevel took the toolbar
// and the sidebar with it, and the bar then ran out of room at the window's own
// minimum width. The renderer owns the level (uiStore.diffZoom).
const zoomItem = (key, accelerator, action) => ({
  label: t(`menu.view.${key}`),
  accelerator,
  click: () => sendToFocused(action)
})

// Suppress AppKit's injected "Start Dictation" (a network service) and "Emoji &
// Symbols" via their user-default kill switches. (AutoFill / Writing Tools are
// also injected but ship no equivalent switch, so they can't be removed here.)
function disableInjectedMacMenuItems() {
  if (process.platform !== 'darwin') return
  systemPreferences.setUserDefault('NSDisabledDictationMenuItem', 'boolean', true)
  systemPreferences.setUserDefault('NSDisabledCharacterPaletteMenuItem', 'boolean', true)
}

// The four display options, mirroring the renderer's own View menu
// (src/renderer/src/menus.js displayToggles) — its own function like editMenu
// and toolsMenu, so installMenu does not carry them inline.
function displayToggles(sendToFocused) {
  return [
    {
      label: t('menu.view.toggleStructure'),
      accelerator: 'CmdOrCtrl+Shift+D',
      click: () => sendToFocused('toggle-structure')
    },
    {
      label: t('menu.view.toggleSplit'),
      accelerator: 'CmdOrCtrl+\\',
      click: () => sendToFocused('toggle-split')
    },
    { label: t('menu.view.toggleWhitespace'), click: () => sendToFocused('toggle-whitespace') },
    { label: t('menu.view.toggleFocus'), click: () => sendToFocused('toggle-focus') }
  ]
}

// The View menu is a list of label/accelerator/action triples; spelled out, each
// was five lines of the same shape.
const viewItem = (send, key, accelerator, action) => ({
  label: t(`menu.view.${key}`),
  accelerator,
  click: () => send(action)
})

const settingsItem = (send) => ({
  label: t('menu.file.settings'),
  accelerator: 'CmdOrCtrl+,',
  click: () => send('settings')
})

const viewMenu = (send, isDev) => ({
  label: t('menu.view.title'),
  submenu: [
    viewItem(send, 'commandPalette', 'CmdOrCtrl+Shift+P', 'command-palette'),
    viewItem(send, 'toggleSidebar', 'CmdOrCtrl+B', 'toggle-sidebar'),
    { type: 'separator' },
    { label: t('menu.view.display'), submenu: displayToggles(send) },
    viewItem(send, 'toggleTheme', 'CmdOrCtrl+D', 'toggle-theme'),
    viewItem(send, 'presentation', 'F5', 'toggle-presentation'),
    { type: 'separator' },
    {
      label: t('menu.view.quickLook'),
      // User-configurable global shortcut (Settings), so no fixed hint here.
      click: () => toggleQuickLook()
    },
    viewItem(send, 'mergeConflicts', 'CmdOrCtrl+Shift+K', 'merge-conflicts'),
    { type: 'separator' },
    {
      label: t('menu.view.zoom'),
      submenu: [
        zoomItem('zoomIn', 'CmdOrCtrl+=', 'zoom-in'),
        zoomItem('zoomOut', 'CmdOrCtrl+-', 'zoom-out'),
        zoomItem('resetZoom', 'CmdOrCtrl+0', 'zoom-reset')
      ]
    },
    ...(isDev ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : [])
  ]
})

const fileItem = (send, key, accelerator, action) => ({
  label: t(`menu.file.${key}`),
  ...(accelerator ? { accelerator } : {}),
  click: () => send(action)
})

const fileMenu = (send, isMac) => ({
  label: t('menu.file.title'),
  submenu: [
    fileItem(send, 'openLeft', 'CmdOrCtrl+1', 'open-left'),
    fileItem(send, 'openRight', 'CmdOrCtrl+2', 'open-right'),
    fileItem(send, 'openAsSnippet', 'CmdOrCtrl+O', 'open-file-as-snippet'),
    { type: 'separator' },
    fileItem(send, 'save', 'CmdOrCtrl+S', 'save'),
    fileItem(send, 'share', 'CmdOrCtrl+E', 'share-current'),
    {
      label: t('menu.file.import'),
      submenu: [
        fileItem(send, 'importShared', 'CmdOrCtrl+I', 'import-shared'),
        fileItem(send, 'importSnippets', null, 'import-snippets')
      ]
    },
    {
      label: t('menu.file.export'),
      submenu: [
        fileItem(send, 'exportHtml', null, 'export-html'),
        fileItem(send, 'exportImage', null, 'export-image'),
        fileItem(send, 'exportSnippetFile', 'CmdOrCtrl+Alt+S', 'save-snippet-as-file'),
        fileItem(send, 'exportAllSnippets', null, 'export-snippets')
      ]
    },
    { type: 'separator' },
    fileItem(send, 'newComparison', 'CmdOrCtrl+Shift+T', 'tab-new'),
    fileItem(send, 'newSnippet', null, 'open-new-snippet'),
    fileItem(send, 'closeComparison', 'CmdOrCtrl+Shift+W', 'tab-close'),
    fileItem(send, 'nextComparison', 'Ctrl+Tab', 'tab-next'),
    fileItem(send, 'prevComparison', 'Ctrl+Shift+Tab', 'tab-prev'),
    { type: 'separator' },
    settingsItem(send),
    { type: 'separator' },
    isMac ? { role: 'close' } : { role: 'quit' }
  ]
})

export function installMenu() {
  const isMac = process.platform === 'darwin'
  disableInjectedMacMenuItems()
  // DevTools (and its accelerator) ship only in development builds.
  const isDev = !app.isPackaged
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    fileMenu(sendToFocused, isMac),
    editMenu(sendToFocused, isMac),
    viewMenu(sendToFocused, isDev),
    securityMenu(sendToFocused),
    toolsMenu(sendToFocused),
    helpMenu({
      send: sendToFocused,
      version: app.getVersion(),
      onReportIssue: (_item, win) => promptAndOpenIssue(win)
    })
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
  // The menu is a template built once at startup, so a language change has to
  // rebuild it. The id is normalized in main — the renderer's value only ever
  // selects a key in the bundled catalogue.
  ipcMain.handle('app:setLocale', (_e, id) => {
    setLocale(id)
    installMenu()
    refreshTrayMenu()
  })
}
