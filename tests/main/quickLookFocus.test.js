import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listeners = new Map()
vi.mock('electron', () => ({
  ipcMain: { on: (channel, fn) => listeners.set(channel, fn) }
}))

// The renderer that arms the guard is a window, and a window can go away without
// ever sending the false.
const sender = () => {
  const once = []
  return { once: (event, fn) => once.push([event, fn]), destroy: () => once.forEach(([, fn]) => fn()) }
}

const { allowMainFocus, hideLauncher, isCapturingShortcut, registerQuickLookFocusIpc } =
  await import('../../src/main/quickLookFocus')

const fakeWindow = (over = {}) => ({
  hidden: false,
  focusable: true,
  hide() {
    this.hidden = true
  },
  setFocusable(on) {
    this.focusable = on
  },
  isVisible: () => true,
  isMinimized: () => false,
  isDestroyed: () => false,
  ...over
})

// The launcher summons over whatever app is in front, INCLUDING Diff Bro. The
// guard used to be the other way round — the chord did nothing whenever the main
// window had focus, which is where a launcher is most often reached for.
describe('the shortcut guard', () => {
  beforeEach(() => registerQuickLookFocusIpc())

  it('answers by default, and only holds off while Settings waits for a chord', () => {
    const capture = listeners.get('quicklook:capturing-shortcut')
    expect(isCapturingShortcut()).toBe(false)

    capture({ sender: sender() }, true)
    expect(isCapturingShortcut()).toBe(true)

    capture({ sender: sender() }, false)
    expect(isCapturingShortcut()).toBe(false)
  })

  // Settings closed with Cmd+W mid-capture never sends the false. Left armed,
  // the chord is dead for the rest of the session with no window to explain it —
  // and on Windows the app lives on in the tray, where the chord is the whole
  // point.
  it('disarms itself when the window that armed it goes away', () => {
    const capture = listeners.get('quicklook:capturing-shortcut')
    const window = sender()
    capture({ sender: window }, true)
    expect(isCapturingShortcut()).toBe(true)

    window.destroy()
    expect(isCapturingShortcut()).toBe(false)
  })

  it('takes nothing but a literal true, since it arrives over IPC', () => {
    const capture = listeners.get('quicklook:capturing-shortcut')
    capture({ sender: sender() }, 'yes')
    expect(isCapturingShortcut()).toBe(false)
    capture({ sender: sender() }, 1)
    expect(isCapturingShortcut()).toBe(false)
  })
})

// Dismissing the launcher on macOS raises the app's next window unless the main
// window is made briefly un-focusable. Both halves matter: parking it, and
// giving focus back — a window left un-focusable ignores every later focus()
// call in silence.
describe('hideLauncher', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('parks the main window on macOS, then hands focus back', () => {
    const launcher = fakeWindow()
    const main = fakeWindow()
    hideLauncher({ launcher, main, platform: 'darwin' })

    expect(launcher.hidden).toBe(true)
    expect(main.focusable).toBe(false)

    vi.advanceTimersByTime(300)
    expect(main.focusable).toBe(true)
  })

  it('leaves the main window alone off macOS, where hiding raises nothing', () => {
    const launcher = fakeWindow()
    const main = fakeWindow()
    hideLauncher({ launcher, main, platform: 'win32' })

    expect(launcher.hidden).toBe(true)
    expect(main.focusable).toBe(true)
  })

  it('parks nothing when there is no main window, or it is out of sight', () => {
    const launcher = fakeWindow()
    hideLauncher({ launcher, main: null, platform: 'darwin' })
    expect(launcher.hidden).toBe(true)

    const hiddenMain = fakeWindow({ isVisible: () => false })
    hideLauncher({ launcher, main: hiddenMain, platform: 'darwin' })
    expect(hiddenMain.focusable).toBe(true)

    const minimized = fakeWindow({ isMinimized: () => true })
    hideLauncher({ launcher, main: minimized, platform: 'darwin' })
    expect(minimized.focusable).toBe(true)
  })

  // Summoning the main window mid-park has to end the park FIRST, or focus()
  // is a no-op and the window surfaces without the keyboard.
  it('allowMainFocus ends the park early and cancels its timer', () => {
    const main = fakeWindow()
    hideLauncher({ launcher: fakeWindow(), main, platform: 'darwin' })
    expect(main.focusable).toBe(false)

    allowMainFocus(main)
    expect(main.focusable).toBe(true)

    main.setFocusable(false)
    vi.advanceTimersByTime(300)
    expect(main.focusable).toBe(false)
  })

  it('never touches a destroyed window', () => {
    const gone = fakeWindow({ isDestroyed: () => true, focusable: false })
    allowMainFocus(gone)
    expect(gone.focusable).toBe(false)
    expect(() => allowMainFocus(null)).not.toThrow()
  })
})
