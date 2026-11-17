import { app, ipcMain } from 'electron'
import { getLogDir } from './logger'

const SETTLE_MS = 3000

// scripts/packaged-smoke.mjs only: once the renderer is up and startup has settled, report and quit.
export function reportWhenSmokeTested() {
  if (process.env.DIFFBRO_SMOKE !== '1') return
  ipcMain.once('cli:ready', () =>
    setTimeout(() => {
      // eslint-disable-next-line no-underscore-dangle -- Electron keeps no public list of handlers
      const map = ipcMain._invokeHandlers
      const handlers = map instanceof Map ? [...map.keys()] : null
      process.stdout.write(`${JSON.stringify({ smoke: 'ready', handlers, logDir: getLogDir() })}\n`)
      app.quit()
    }, SETTLE_MS)
  )
}
