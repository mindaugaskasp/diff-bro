// The Windows notification-area icon: the Electron glue over trayCore.js.
//
// Pressing X on Windows stores the window rather than ending the app, so the
// global quick look-up shortcut survives it — which is the whole point, and also
// why there has to be a visible way back and a visible way out. The tray is
// both.
//
// SECURITY: the two settings here reach outside the app (a registry Run entry),
// so both are booleans and nothing more. The executable registered at login is
// main's own process.execPath, chosen here — the renderer never names a path,
// and there is no handler that would let it (rule 7).
import { Menu, Tray, app, ipcMain } from 'electron'
import trayIcon from '../../resources/tray.png?asset'
import { readSettings } from './appData'
import { t } from './i18n'
import { hasTray, loginItemSettings, shouldHideOnClose, trayMenuRows } from './trayCore'

let tray = null
// Set by every route out of the app, and read by the close handler: without it
// Exit would hide the window and leave the process alive.
let quitting = false
let actions = {}

export const markQuitting = () => {
  quitting = true
}

/**
 * Hide-to-tray for a main window. Called per window rather than inside
 * createWindow so window.js keeps no opinion about the tray.
 * @param {import('electron').BrowserWindow} win
 */
export function attachCloseToTray(win) {
  win.on('close', (e) => {
    const hide = shouldHideOnClose({
      platform: process.platform,
      closeToTray: readSettings().closeToTray,
      quitting
    })
    if (!hide) return
    e.preventDefault()
    win.hide()
  })
}

function buildMenu() {
  const template = trayMenuRows().map((row) =>
    row.id === 'separator'
      ? { type: 'separator' }
      : { label: t(row.labelKey), click: () => actions[row.id]?.() }
  )
  return Menu.buildFromTemplate(template)
}

/**
 * @param {{ openMainWindow: () => void, toggleQuickLook: () => void }} handlers
 */
export function installTray(handlers) {
  if (!hasTray(process.platform) || tray) return null
  actions = {
    open: handlers.openMainWindow,
    quickLook: handlers.toggleQuickLook,
    exit: () => {
      markQuitting()
      app.quit()
    }
  }
  tray = new Tray(trayIcon)
  tray.setToolTip(t('tray.tooltip'))
  tray.setContextMenu(buildMenu())
  // Left click is the shortest way back to what you closed.
  tray.on('click', () => actions.open?.())
  // Windows leaves a ghost icon in the notification area for a process that
  // exits without releasing it; it only disappears when something hovers it.
  app.on('will-quit', destroyTray)
  return tray
}

// The menu is built from the catalogue, so a language change has to rebuild it —
// the same reason installMenu is re-run rather than built once.
export function refreshTrayMenu() {
  if (tray) tray.setContextMenu(buildMenu())
}

function destroyTray() {
  tray?.destroy()
  tray = null
}

/**
 * Windows' "start when I sign in". Off unless asked for: a login item is a
 * machine-level change and nobody should acquire one by surprise.
 * @param {boolean} on
 */
export function setStartAtLogin(on) {
  if (!hasTray(process.platform)) return { ok: false, error: 'unsupported' }
  app.setLoginItemSettings(loginItemSettings(on))
  return { ok: true, openAtLogin: app.getLoginItemSettings().openAtLogin === true }
}

export function startAtLogin() {
  if (!hasTray(process.platform)) return false
  return app.getLoginItemSettings().openAtLogin === true
}

export function registerTrayIpc() {
  // Whether this platform has the behaviour at all, so the Settings pane hides
  // the toggles rather than offering two that do nothing.
  ipcMain.handle('tray:supported', () => hasTray(process.platform))
  // Booleans only. The close behaviour itself is read from settings.json at the
  // moment of the close, so there is no state here to fall out of step.
  ipcMain.handle('app:startAtLogin', () => startAtLogin())
  ipcMain.handle('app:setStartAtLogin', (_e, on) => setStartAtLogin(on === true))
}
