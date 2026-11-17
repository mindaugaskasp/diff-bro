import { describe, expect, it } from 'vitest'
import {
  loggedErrors,
  missingChannels,
  packagedExecutable,
  preloadChannels,
  smokeVerdict
} from '../../scripts/lib/packagedSmoke.mjs'

const SINCE = Date.parse('2026-11-17T16:57:00.000Z')
const LOG = [
  '[2026-11-17T16:50:00.000Z] [main] Unhandled rejection: from an earlier launch',
  '[2026-11-17T16:57:18.272Z] [main] Unhandled rejection: Failed to load image',
  '  env: 0.19.0 win32 x64',
  '    at installTray (app.asar/build/main/index.js:1702:10)',
  '[2026-11-17T16:57:18.300Z] [cli] [info] second launch received',
  "[2026-11-17T16:57:18.758Z] [renderer] Error invoking remote method 'lan:state'"
].join('\n')

describe('packaged smoke', () => {
  it('collects every channel the preload invokes, once', () => {
    const src =
      "a: () => ipcRenderer.invoke('lan:state'), b: (x) => ipcRenderer.invoke( 'store:load', x), c: () => ipcRenderer.invoke('lan:state')"
    expect(preloadChannels([src, "ipcRenderer.send('cli:ready')"])).toEqual([
      'lan:state',
      'store:load'
    ])
  })

  it('names the channels main has no handler for', () => {
    expect(missingChannels(['lan:state', 'store:load'], ['store:load'])).toEqual(['lan:state'])
  })

  it('reports errors logged during this launch and skips informational lines', () => {
    expect(loggedErrors(LOG, SINCE)).toEqual([
      '[main] Unhandled rejection: Failed to load image (at installTray (app.asar/build/main/index.js:1702:10))',
      "[renderer] Error invoking remote method 'lan:state'"
    ])
  })

  it('fails a launch whose renderer never came up, or whose handlers cannot be listed', () => {
    expect(smokeVerdict({ report: null, expected: [], logText: '', since: SINCE })).toEqual([
      'the renderer never reported ready'
    ])
    expect(
      smokeVerdict({ report: { handlers: null }, expected: [], logText: '', since: SINCE })
    ).toEqual(['main could not list its IPC handlers'])
  })

  it('passes a clean launch with every channel handled', () => {
    const report = { handlers: ['lan:state'] }
    expect(smokeVerdict({ report, expected: ['lan:state'], logText: '', since: SINCE })).toEqual([])
  })

  it('finds the unpacked executable electron-builder left in dist', () => {
    expect(packagedExecutable(['builder-debug.yml', 'win-unpacked', 'x.exe'])).toBe(
      'win-unpacked/Diff Bro.exe'
    )
    expect(packagedExecutable(['mac-arm64', 'x.dmg'])).toBe(
      'mac-arm64/Diff Bro.app/Contents/MacOS/Diff Bro'
    )
    expect(packagedExecutable(['linux-arm64-unpacked'])).toBe('linux-arm64-unpacked/diffbro')
    expect(packagedExecutable(['x.AppImage'])).toBeNull()
  })
})
