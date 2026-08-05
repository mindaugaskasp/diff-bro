import { describe, expect, it } from 'vitest'
import {
  hasTray,
  loginItemSettings,
  shouldHideOnClose,
  startsHidden,
  trayMenuRows
} from '../../src/main/trayCore'

describe('hasTray', () => {
  it('is Windows only', () => {
    expect(hasTray('win32')).toBe(true)
    expect(hasTray('darwin')).toBe(false)
    expect(hasTray('linux')).toBe(false)
  })
})

describe('shouldHideOnClose', () => {
  const win = { platform: 'win32', closeToTray: true, quitting: false }

  it('hides the window on Windows when the setting is on', () => {
    expect(shouldHideOnClose(win)).toBe(true)
  })

  // Without this, Exit hides the window and leaves the process running — the
  // app becomes unquittable except through Task Manager.
  it('lets the close through once something has asked the app to quit', () => {
    expect(shouldHideOnClose({ ...win, quitting: true })).toBe(false)
  })

  it('lets the close through when the user turned the setting off', () => {
    expect(shouldHideOnClose({ ...win, closeToTray: false })).toBe(false)
  })

  // A settings file written before this existed has no key, and the setting
  // ships on — so absent must read as on, not as off.
  it('treats an unset preference as on', () => {
    expect(shouldHideOnClose({ ...win, closeToTray: undefined })).toBe(true)
  })

  it('never hides where there is no tray to recover the window from', () => {
    expect(shouldHideOnClose({ ...win, platform: 'darwin' })).toBe(false)
    expect(shouldHideOnClose({ ...win, platform: 'linux' })).toBe(false)
  })
})

describe('startsHidden', () => {
  it('is what the login item passes', () => {
    expect(startsHidden(['C:\\DiffBro.exe', '--hidden'])).toBe(true)
  })

  it('is off for an ordinary launch', () => {
    expect(startsHidden(['C:\\DiffBro.exe'])).toBe(false)
    expect(startsHidden([])).toBe(false)
    expect(startsHidden(undefined)).toBe(false)
  })
})

describe('trayMenuRows', () => {
  it('offers a way back to the window and a way out of the app', () => {
    const ids = trayMenuRows().map((r) => r.id)
    expect(ids).toContain('open')
    expect(ids).toContain('exit')
  })

  // The catalogue is the single source for user-facing text; a row carrying a
  // translated string would freeze the startup language.
  it('names catalogue keys, never translated text', () => {
    for (const row of trayMenuRows()) {
      if (row.id === 'separator') continue
      expect(row.labelKey).toMatch(/^tray\./)
    }
  })
})

describe('loginItemSettings', () => {
  it('asks for a hidden launch, so signing in does not throw a window up', () => {
    expect(loginItemSettings(true)).toEqual({ openAtLogin: true, args: ['--hidden'] })
  })

  it('coerces anything that is not true to off', () => {
    expect(loginItemSettings(false).openAtLogin).toBe(false)
    expect(loginItemSettings(undefined).openAtLogin).toBe(false)
    expect(loginItemSettings('yes').openAtLogin).toBe(false)
  })

  // The executable is main's own; nothing here can name a different one.
  it('never carries a path', () => {
    expect(JSON.stringify(loginItemSettings(true))).not.toMatch(/exe|path/i)
  })
})
