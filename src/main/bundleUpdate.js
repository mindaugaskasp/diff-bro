import { BrowserWindow, app } from 'electron'
import { createUpdateCheck, infoPlistPath, readBundleVersion } from './bundleVersion'

// `brew upgrade` swaps the bundle under a running app; focus is when the user comes back to it.
export function watchForBundleUpdate() {
  if (process.platform !== 'darwin' || !app.isPackaged) return
  const check = createUpdateCheck({
    running: app.getVersion(),
    read: () => readBundleVersion(infoPlistPath(process.execPath))
  })
  app.on('browser-window-focus', () => {
    const version = check()
    if (!version) return
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('app:updated', version)
  })
}
