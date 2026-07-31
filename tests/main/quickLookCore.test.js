import { describe, expect, it } from 'vitest'
import {
  placeWindow,
  displayForPoint,
  displayIndexForPoint,
  launcherDiagnostics,
  launcherSpaceBehavior,
  needsMainWindow,
  resolveAccelerator
} from '../../src/main/quickLookCore'

describe('placeWindow', () => {
  const work = { x: 0, y: 0, width: 1920, height: 1080 }
  const win = { width: 720, height: 480 }

  it('centres horizontally and sits in the upper third', () => {
    const { x, y } = placeWindow(work, win)
    expect(x).toBe((1920 - 720) / 2) // 600
    // upper third: 28% of the free vertical space above the window
    expect(y).toBe(Math.round((1080 - 480) * 0.28)) // 168
  })

  it('offsets by the display origin on a secondary monitor', () => {
    const { x, y } = placeWindow({ x: 1920, y: 0, width: 1280, height: 800 }, win)
    expect(x).toBe(1920 + Math.round((1280 - 720) / 2))
    expect(y).toBe(Math.round((800 - 480) * 0.28))
  })

  it('clamps a window larger than the work area to the top-left origin', () => {
    const { x, y } = placeWindow({ x: 10, y: 20, width: 400, height: 300 }, win)
    expect(x).toBe(10)
    expect(y).toBe(20)
  })
})

describe('displayForPoint', () => {
  const displays = [
    { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
    { bounds: { x: 1920, y: 0, width: 1280, height: 800 } }
  ]

  it('returns the display whose bounds contain the point', () => {
    expect(displayForPoint(displays, { x: 2000, y: 100 })).toBe(displays[1])
    expect(displayForPoint(displays, { x: 10, y: 10 })).toBe(displays[0])
  })

  it('falls back to the first display when the point is off every screen', () => {
    expect(displayForPoint(displays, { x: -50, y: -50 })).toBe(displays[0])
  })

  it('returns null when there are no displays', () => {
    expect(displayForPoint([], { x: 0, y: 0 })).toBe(null)
    expect(displayForPoint(null, { x: 0, y: 0 })).toBe(null)
  })
})

describe('displayIndexForPoint', () => {
  const displays = [
    { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
    { bounds: { x: 1920, y: 0, width: 1280, height: 800 } }
  ]

  it('returns the index of the containing display, else -1', () => {
    expect(displayIndexForPoint(displays, { x: 2000, y: 100 })).toBe(1)
    expect(displayIndexForPoint(displays, { x: 10, y: 10 })).toBe(0)
    expect(displayIndexForPoint(displays, { x: -50, y: -50 })).toBe(-1)
  })

  it('returns -1 for a missing point or no displays', () => {
    expect(displayIndexForPoint(displays, null)).toBe(-1)
    expect(displayIndexForPoint(null, { x: 0, y: 0 })).toBe(-1)
  })
})

describe('launcherDiagnostics', () => {
  const displays = [
    { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
    { bounds: { x: 1920, y: 0, width: 1280, height: 800 } }
  ]

  it('records the cursor display and that the main window is on another one', () => {
    const line = launcherDiagnostics({
      event: 'reveal',
      displays,
      cursor: { x: 2000, y: 100 }, // display 1
      main: {
        visible: true,
        minimized: false,
        focused: false,
        bounds: { x: 100, y: 100, width: 800, height: 600 }
      }, // display 0
      launcher: { x: 2100, y: 200, width: 720, height: 480 } // display 1
    })
    expect(line).toContain('event=reveal')
    expect(line).toContain('displays=2')
    expect(line).toContain('cursorDisplay=1')
    expect(line).toContain('mainVisible=true')
    expect(line).toContain('mainDisplay=0')
    expect(line).toContain('launcherDisplay=1')
  })

  it('notes when there is no main window and no launcher position', () => {
    const line = launcherDiagnostics({ event: 'hide', displays, cursor: { x: 10, y: 10 } })
    expect(line).toContain('event=hide')
    expect(line).toContain('main=none')
    expect(line).not.toContain('launcherDisplay')
  })
})

describe('needsMainWindow', () => {
  const launcher = { id: 'launcher' }
  const main = { id: 'main' }

  // The regression: a count-based check sees the warm launcher and never reopens.
  it('is true when the warm launcher is the only open window', () => {
    expect(needsMainWindow([launcher], launcher)).toBe(true)
  })

  it('is true when no windows are open at all', () => {
    expect(needsMainWindow([], launcher)).toBe(true)
    expect(needsMainWindow([], null)).toBe(true)
  })

  it('is false while a main window is open, launcher or not', () => {
    expect(needsMainWindow([main], launcher)).toBe(false)
    expect(needsMainWindow([launcher, main], launcher)).toBe(false)
    expect(needsMainWindow([main], null)).toBe(false)
  })

  it('tolerates a missing window list', () => {
    expect(needsMainWindow(undefined, launcher)).toBe(true)
  })
})

describe('launcherSpaceBehavior', () => {
  // The regression: `alwaysOnTop` alone confines the launcher to the app's Space.
  it('joins every Space above full-screen apps on macOS', () => {
    expect(launcherSpaceBehavior('darwin')).toEqual({
      level: 'screen-saver',
      visibleOnAllWorkspaces: true,
      visibleOnFullScreen: true
    })
  })

  it('is skipped where Spaces do not apply and alwaysOnTop already covers it', () => {
    expect(launcherSpaceBehavior('win32')).toBe(null)
    expect(launcherSpaceBehavior('linux')).toBe(null)
    expect(launcherSpaceBehavior(undefined)).toBe(null)
  })
})

describe('resolveAccelerator', () => {
  const FALLBACK = 'CommandOrControl+Shift+Space'
  it('keeps a non-empty stored accelerator', () => {
    expect(resolveAccelerator('Alt+Shift+D', FALLBACK)).toBe('Alt+Shift+D')
  })
  it('falls back for missing, empty, or non-string values', () => {
    expect(resolveAccelerator(undefined, FALLBACK)).toBe(FALLBACK)
    expect(resolveAccelerator('', FALLBACK)).toBe(FALLBACK)
    expect(resolveAccelerator('   ', FALLBACK)).toBe(FALLBACK)
    expect(resolveAccelerator(42, FALLBACK)).toBe(FALLBACK)
  })
})
