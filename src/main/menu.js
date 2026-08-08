import { BrowserWindow, Menu, app, dialog, ipcMain, shell, systemPreferences } from 'electron'
import { homedir } from 'os'
import { ISSUE_BASE, buildIssueUrl } from './issueUrl'
import { isLauncher, toggleQuickLook } from './quickLook'
import { editMenu, helpMenu, securityMenu, terminalMenu, toolsMenu } from './menuSections'
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

const settingsItem = (send) => ({
  label: t('menu.file.settings'),
  accelerator: 'CmdOrCtrl+,',
  click: () => send('settings')
})

export function installMenu() {
  const isMac = process.platform === 'darwin'
  disableInjectedMacMenuItems()
  // DevTools (and its accelerator) ship only in development builds.
  const isDev = !app.isPackaged
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: t('menu.file.title'),
      submenu: [
        {
          label: t('menu.file.openLeft'),
          accelerator: 'CmdOrCtrl+1',
          click: () => sendToFocused('open-left')
        },
        {
          label: t('menu.file.openRight'),
          accelerator: 'CmdOrCtrl+2',
          click: () => sendToFocused('open-right')
        },
        { type: 'separator' },
        {
          label: t('menu.file.save'),
          accelerator: 'CmdOrCtrl+S',
          click: () => sendToFocused('save')
        },
        {
          label: t('menu.file.share'),
          accelerator: 'CmdOrCtrl+E',
          click: () => sendToFocused('share-current')
        },
        {
          label: t('menu.file.import'),
          accelerator: 'CmdOrCtrl+I',
          click: () => sendToFocused('import-shared')
        },
        { label: t('menu.file.exportHtml'), click: () => sendToFocused('export-html') },
        { label: t('menu.file.exportImage'), click: () => sendToFocused('export-image') },
        { type: 'separator' },
        {
          label: t('menu.file.newComparison'),
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => sendToFocused('tab-new')
        },
        {
          label: t('menu.file.closeComparison'),
          accelerator: 'CmdOrCtrl+Shift+W',
          click: () => sendToFocused('tab-close')
        },
        {
          label: t('menu.file.nextComparison'),
          accelerator: 'Ctrl+Tab',
          click: () => sendToFocused('tab-next')
        },
        {
          label: t('menu.file.prevComparison'),
          accelerator: 'Ctrl+Shift+Tab',
          click: () => sendToFocused('tab-prev')
        },
        { label: t('menu.file.importSnippets'), click: () => sendToFocused('import-snippets') },
        { type: 'separator' },
        settingsItem(sendToFocused),
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    editMenu(sendToFocused, isMac),
    terminalMenu(sendToFocused),
    {
      label: t('menu.view.title'),
      submenu: [
        {
          label: t('menu.view.commandPalette'),
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => sendToFocused('command-palette')
        },
        {
          label: t('menu.view.toggleSidebar'),
          accelerator: 'CmdOrCtrl+B',
          click: () => sendToFocused('toggle-sidebar')
        },
        { type: 'separator' },
        ...displayToggles(sendToFocused),
        {
          label: t('menu.view.toggleTheme'),
          accelerator: 'CmdOrCtrl+D',
          click: () => sendToFocused('toggle-theme')
        },
        { type: 'separator' },
        {
          label: t('menu.view.quickLook'),
          // User-configurable global shortcut (Settings), so no fixed hint here.
          click: () => toggleQuickLook()
        },
        { type: 'separator' },
        zoomItem('zoomIn', 'CmdOrCtrl+=', 'zoom-in'),
        zoomItem('zoomOut', 'CmdOrCtrl+-', 'zoom-out'),
        zoomItem('resetZoom', 'CmdOrCtrl+0', 'zoom-reset'),
        ...(isDev ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : [])
      ]
    },
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
