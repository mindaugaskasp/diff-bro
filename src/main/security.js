import { app, session } from 'electron'
import { DEV_URL } from './env'

// OFFLINE GUARANTEE — do not weaken (docs/standards.md rule 1). Every request is blocked
// at the session level except local schemes (and the Vite dev server in dev).
export function installNetworkKillSwitch() {
  // Deny every Chromium permission request — nothing here needs any.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false)
  )
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url
    const isLocalScheme =
      url.startsWith('file://') ||
      url.startsWith('devtools://') ||
      url.startsWith('blob:') ||
      url.startsWith('data:')
    const isDevServer =
      !!DEV_URL &&
      (url.startsWith(DEV_URL) ||
        url.startsWith('ws://localhost') ||
        url.startsWith('ws://127.0.0.1'))
    callback({ cancel: !(isLocalScheme || isDevServer) })
  })
}

// Docker/headless-CI only (DIFFBRO_DOCKER, set by the container): no GPU, runs
// as root, so Chromium's sandbox + GPU compositing are off. Never on desktop.
export function applyHeadlessSwitches() {
  if (!process.env.DIFFBRO_DOCKER) return
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-dev-shm-usage')
  app.disableHardwareAcceleration()
}
