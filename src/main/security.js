import { app, session } from 'electron'
import { DEV_URL } from './env'

// ---------------------------------------------------------------------------
// OFFLINE GUARANTEE
// This app must never send anything over the network. All requests are
// blocked at the session level; only local schemes are allowed. In dev mode
// the Vite dev server (localhost) is additionally allowed for HMR.
//
// Do not weaken anything in this file. See CLAUDE.md rule 1.
// ---------------------------------------------------------------------------
export function installNetworkKillSwitch() {
  // Deny every Chromium permission request (camera, geolocation, midi,
  // notifications, …) — nothing in this app needs any of them.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
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

// ---------------------------------------------------------------------------
// Docker / headless-CI support: the container has no GPU and runs as root,
// so Chromium needs its sandbox and GPU compositing turned off there.
// Set by docker/entrypoint.sh — never in normal desktop use.
//
// Must be called before app ready, while the command line is still mutable.
// ---------------------------------------------------------------------------
export function applyHeadlessSwitches() {
  if (!process.env.DIFFBRO_DOCKER) return
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-dev-shm-usage')
  app.disableHardwareAcceleration()
}
