import { describe, expect, it } from 'vitest'
import { findKeyAction } from '../../../src/renderer/src/utils/findKeys'

const key = (k, mods = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods
})

describe('findKeyAction on macOS', () => {
  const mac = (e) => findKeyAction(e, { isMac: true })
  it('⌘F finds', () => expect(mac(key('f', { metaKey: true }))).toBe('find'))
  it('⌘⌥F replaces', () =>
    expect(mac(key('ƒ', { metaKey: true, altKey: true, code: 'KeyF' }))).toBe('replace'))
  it('Ctrl+F is not find on a Mac', () => expect(mac(key('f', { ctrlKey: true }))).toBeNull())
  it('⌘⇧F belongs to the app menu, not find', () =>
    expect(mac(key('F', { metaKey: true, shiftKey: true }))).toBeNull())
})

describe('findKeyAction on Windows and Linux', () => {
  const pc = (e) => findKeyAction(e, { isMac: false })
  it('Ctrl+F finds', () => expect(pc(key('f', { ctrlKey: true }))).toBe('find'))
  it('Ctrl+H replaces', () => expect(pc(key('h', { ctrlKey: true }))).toBe('replace'))
  it('a plain F is typing', () => expect(pc(key('f'))).toBeNull())
})
