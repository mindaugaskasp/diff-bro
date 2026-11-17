import { describe, expect, it } from 'vitest'
import {
  SILENCE_CHOICES,
  arePopupsShown,
  cleanComputerName,
  defaultLanSettings,
  normalizeLanSettings,
  setPopups,
  silence
} from '../../../src/main/lan/lanSettings'

describe('defaults', () => {
  it('is on, visible, with popups, named after the computer', () => {
    expect(defaultLanSettings('Jonas’s MacBook Pro')).toEqual({
      enabled: true,
      visible: true,
      popups: true,
      silencedUntil: 0,
      name: 'Jonas’s MacBook Pro'
    })
  })
})

describe('cleanComputerName', () => {
  it.each([
    ['Jonas’s MacBook Pro', 'Jonas’s MacBook Pro'],
    ['jonas-mbp.local', 'jonas-mbp'],
    ['DESKTOP-4F2K.corp.example.com', 'DESKTOP-4F2K'],
    ['  ', 'Diff Bro'],
    [undefined, 'Diff Bro'],
    ['x'.repeat(100), 'x'.repeat(64)]
  ])('%s → %s', (raw, want) => expect(cleanComputerName(raw)).toBe(want))
})

describe('normalizeLanSettings', () => {
  it('keeps valid saved values', () => {
    const saved = { enabled: false, visible: false, popups: false, silencedUntil: 5, name: 'Ben' }
    expect(normalizeLanSettings(saved, 'pc')).toEqual(saved)
  })

  it('falls back field by field on junk', () => {
    expect(normalizeLanSettings({ enabled: 'yes', name: '', silencedUntil: -3 }, 'pc')).toEqual(
      defaultLanSettings('pc')
    )
    expect(normalizeLanSettings(null, 'pc')).toEqual(defaultLanSettings('pc'))
  })

  it('trims and caps the name', () => {
    expect(normalizeLanSettings({ name: `  ${'n'.repeat(80)}  ` }, 'pc').name).toBe('n'.repeat(64))
  })
})

describe('silencing', () => {
  const base = defaultLanSettings('pc')

  it('offers the agreed durations and Forever', () => {
    expect(SILENCE_CHOICES).toEqual([1, 5, 10, 30, 60, 1440, 'forever'])
  })

  it('silences for a number of minutes', () => {
    const s = silence(base, 30, 1000)
    expect(s.silencedUntil).toBe(1000 + 30 * 60_000)
    expect(arePopupsShown(s, 1000)).toBe(false)
    expect(arePopupsShown(s, 1000 + 30 * 60_000)).toBe(true)
  })

  it('Forever turns Show popups off', () => {
    const s = silence(base, 'forever', 1000)
    expect(s.popups).toBe(false)
    expect(arePopupsShown(s, 10 ** 15)).toBe(false)
  })

  it('refuses a duration that is not offered', () => {
    expect(silence(base, 7, 0)).toEqual(base)
  })

  it('turning popups back on clears a timed silence', () => {
    const s = setPopups(silence(base, 60, 0), true)
    expect(s).toEqual({ ...base, popups: true, silencedUntil: 0 })
    expect(setPopups(base, false).popups).toBe(false)
  })
})
