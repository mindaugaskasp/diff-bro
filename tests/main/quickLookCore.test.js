import { describe, expect, it, vi } from 'vitest'
import {
  keepOnScreen,
  launcherSize,
  placeWindow,
  displayForPoint,
  displayIndexForPoint,
  launcherDiagnostics,
  launcherSpaceBehavior,
  needsMainWindow,
  isValidAccelerator,
  storedAccelerator,
  swapShortcut
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

// Growing for a job moves the card's edges, never its origin. Re-centring slid
// every row sideways out from under the pointer that had just clicked one, which
// is how two clicks on Edit went missing.
describe('keepOnScreen', () => {
  const work = { x: 0, y: 0, width: 1920, height: 1080 }

  it('leaves the origin alone when the bigger card still fits', () => {
    expect(keepOnScreen({ x: 600, y: 168 }, { width: 960, height: 720 }, work)).toEqual({
      x: 600,
      y: 168
    })
  })

  it('pulls it back just far enough when growing would run off an edge', () => {
    expect(keepOnScreen({ x: 1400, y: 900 }, { width: 960, height: 720 }, work)).toEqual({
      x: 960,
      y: 360
    })
  })

  it('offsets by the display origin on a secondary monitor', () => {
    const second = { x: 1920, y: 0, width: 1280, height: 800 }
    expect(keepOnScreen({ x: 2500, y: 700 }, { width: 960, height: 720 }, second)).toEqual({
      x: 2240,
      y: 80
    })
  })

  it('parks a card larger than the work area at its top-left', () => {
    expect(keepOnScreen({ x: 300, y: 300 }, { width: 4000, height: 3000 }, work)).toEqual({
      x: 0,
      y: 0
    })
  })
})

describe('launcherSize', () => {
  const big = { width: 1920, height: 1080 }

  it('gives composing a card several times the resting one', () => {
    const rest = launcherSize('default', big)
    const compose = launcherSize('compose', big)
    expect(compose.width).toBeGreaterThan(rest.width)
    expect(compose.height).toBeGreaterThan(rest.height * 1.5)
  })

  it('never runs a small display edge to edge', () => {
    const size = launcherSize('compose', { width: 1024, height: 640 })
    expect(size.width).toBeLessThanOrEqual(1024 - 80)
    expect(size.height).toBeLessThanOrEqual(640 - 80)
  })

  it('keeps a usable card on a display smaller than the margin allows', () => {
    const size = launcherSize('compose', { width: 300, height: 200 })
    expect(size).toEqual({ width: 420, height: 320 })
  })

  // The mode crosses IPC, so an inherited key must not resolve to a size.
  it('falls back to the resting size for an unknown or inherited mode', () => {
    const rest = launcherSize('default', big)
    expect(launcherSize('constructor', big)).toEqual(rest)
    expect(launcherSize('__proto__', big)).toEqual(rest)
    expect(launcherSize(undefined, big)).toEqual(rest)
  })

  it('asks for its full size when the work area is unknown', () => {
    expect(launcherSize('default')).toEqual({ width: 692, height: 452 })
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

// Main resolves the binding from settings.json BEFORE any window has read that
// file, so the one-time move off the old default has to happen on this side too
// — otherwise the first launch after an update still answers to the old one.
describe('storedAccelerator', () => {
  const FALLBACK = 'Control+Alt+Space'

  it('keeps a binding the user chose', () => {
    const settings = { quickLookShortcut: 'Alt+Shift+D', quickLookShortcutMigrated: true }
    expect(storedAccelerator(settings, FALLBACK)).toBe('Alt+Shift+D')
  })

  it('moves an un-migrated install off the superseded default', () => {
    const settings = { quickLookShortcut: 'CommandOrControl+Shift+Space' }
    expect(storedAccelerator(settings, FALLBACK)).toBe(FALLBACK)
  })

  it('leaves a migrated install alone, even on the old combination', () => {
    const settings = {
      quickLookShortcut: 'CommandOrControl+Shift+Space',
      quickLookShortcutMigrated: true
    }
    expect(storedAccelerator(settings, FALLBACK)).toBe('CommandOrControl+Shift+Space')
  })

  it('falls back for a missing, empty or unreadable settings file', () => {
    for (const settings of [{}, undefined, null, { quickLookShortcut: '   ' }]) {
      expect(storedAccelerator(settings, FALLBACK)).toBe(FALLBACK)
    }
  })
})

// The renderer validates before it asks, but settingsStore claims "the main
// process still guards its own registration" — so it has to be true here.
// A compromised renderer is the threat model (docs/standards.md rule 3), and a
// bare key claimed system-wide is exactly what that buys.
describe('isValidAccelerator (main-side guard)', () => {
  it('requires a modifier and exactly one key', () => {
    expect(isValidAccelerator('CommandOrControl+Shift+Space')).toBe(true)
    expect(isValidAccelerator('Alt+D')).toBe(true)
  })

  it('refuses a bare key, a modifier alone, and junk', () => {
    expect(isValidAccelerator('A')).toBe(false)
    expect(isValidAccelerator('Shift')).toBe(false)
    expect(isValidAccelerator('CommandOrControl+A+B')).toBe(false)
    expect(isValidAccelerator('')).toBe(false)
    expect(isValidAccelerator(null)).toBe(false)
    expect(isValidAccelerator({ toString: () => 'Alt+D' })).toBe(false)
  })
})

// Unregistering before trying the replacement left the user with NO working
// shortcut when the new one was already owned by another app — and the UI still
// displayed the old binding, so nothing said it was dead.
describe('swapShortcut', () => {
  const CURRENT = 'CommandOrControl+Shift+Space'

  it('registers the replacement and only then drops the old one', () => {
    const order = []
    const res = swapShortcut({
      current: CURRENT,
      next: 'Alt+D',
      register: (a) => (order.push(`register:${a}`), true),
      unregister: (a) => order.push(`unregister:${a}`)
    })
    expect(res).toEqual({ ok: true, current: 'Alt+D' })
    expect(order).toEqual(['register:Alt+D', `unregister:${CURRENT}`])
  })

  it('keeps the working shortcut when the replacement is unavailable', () => {
    const unregister = vi.fn()
    const res = swapShortcut({
      current: CURRENT,
      next: 'Alt+D',
      register: () => false,
      unregister
    })
    expect(res).toEqual({ ok: false, error: 'unavailable', current: CURRENT })
    expect(unregister).not.toHaveBeenCalled()
  })

  it('keeps the working shortcut when registering throws', () => {
    const unregister = vi.fn()
    const res = swapShortcut({
      current: CURRENT,
      next: 'Alt+D',
      register: () => {
        throw new Error('bad accelerator')
      },
      unregister
    })
    expect(res).toEqual({ ok: false, error: 'unavailable', current: CURRENT })
    expect(unregister).not.toHaveBeenCalled()
  })

  it('refuses an invalid accelerator without touching the registration at all', () => {
    const register = vi.fn()
    const unregister = vi.fn()
    const res = swapShortcut({ current: CURRENT, next: 'A', register, unregister })
    expect(res).toEqual({ ok: false, error: 'invalid', current: CURRENT })
    expect(register).not.toHaveBeenCalled()
    expect(unregister).not.toHaveBeenCalled()
  })

  it('is a no-op when the requested binding is already the live one', () => {
    const register = vi.fn()
    const unregister = vi.fn()
    const res = swapShortcut({ current: CURRENT, next: CURRENT, register, unregister })
    expect(res).toEqual({ ok: true, current: CURRENT })
    expect(register).not.toHaveBeenCalled()
    expect(unregister).not.toHaveBeenCalled()
  })

  it('registers with nothing to roll back on first run', () => {
    const unregister = vi.fn()
    const res = swapShortcut({
      current: null,
      next: 'Alt+D',
      register: () => true,
      unregister
    })
    expect(res).toEqual({ ok: true, current: 'Alt+D' })
    expect(unregister).not.toHaveBeenCalled()
  })
})

// The mirroring is deliberate (the renderer tree cannot be imported in main),
// so this pins the two copies together: a rule changed on one side and not the
// other fails here rather than in the field.
describe('accelerator validity matches the renderer definition', () => {
  it('agrees on every shape the capture UI can produce', async () => {
    const renderer = await import('../../src/renderer/src/utils/accelerator')
    const corpus = [
      'CommandOrControl+Shift+Space',
      'Alt+D',
      'CommandOrControl+Alt+Shift+F12',
      'Super+K',
      'A',
      'Shift',
      'CommandOrControl',
      'CommandOrControl+A+B',
      'CommandOrControl+',
      '+A',
      '',
      'Space'
    ]
    for (const accel of corpus) {
      expect([accel, isValidAccelerator(accel)]).toEqual([
        accel,
        renderer.isValidAccelerator(accel)
      ])
    }
  })
})
