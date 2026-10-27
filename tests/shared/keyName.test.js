import { describe, it, expect } from 'vitest'
import {
  MAX_KEY_NAME,
  normalizeKeyName,
  keyNameLength,
  keyNameProblem,
  isSameKeyName,
  takenBy,
  distinctKeyName,
  importedKeyName,
  keyReadError
} from '../../src/shared/keyName'

describe('keyName', () => {
  it('strips control characters and collapses whitespace', () => {
    expect(normalizeKeyName('  Alice\u0007\t laptop \n')).toBe('Alice laptop')
    expect(normalizeKeyName(42)).toBe('')
  })

  it('counts what a reader sees, not UTF-16 units', () => {
    expect(keyNameLength('👩‍💻 Rūta')).toBe(6)
    expect(keyNameLength('é')).toBe(1)
  })

  it('requires a name and caps it at the shared limit', () => {
    expect(MAX_KEY_NAME).toBe(40)
    expect(keyNameProblem('   ')).toBe('empty')
    expect(keyNameProblem('a'.repeat(40))).toBeNull()
    expect(keyNameProblem('a'.repeat(41))).toBe('too-long')
    expect(keyNameProblem('😀'.repeat(40))).toBeNull()
  })

  it('compares names ignoring case and spacing', () => {
    expect(isSameKeyName(' alex ', 'ALEX')).toBe(true)
    expect(isSameKeyName('Alex', 'Alexa')).toBe(false)
  })

  it('finds a clash only with a different key', () => {
    const trusted = [{ fingerprint: 'aa', label: 'Alex' }]
    expect(takenBy(trusted, 'alex', 'bb')).toEqual(trusted[0])
    expect(takenBy(trusted, 'alex', 'aa')).toBeNull()
    expect(takenBy(trusted, 'Sam', 'bb')).toBeNull()
  })

  it('suggests the next free numbered name, within the limit', () => {
    const trusted = [
      { fingerprint: 'aa', label: 'Alex' },
      { fingerprint: 'bb', label: 'Alex (2)' }
    ]
    expect(distinctKeyName('Alex', trusted)).toBe('Alex (3)')
    const long = 'x'.repeat(40)
    const suggested = distinctKeyName(long, [{ fingerprint: 'aa', label: long }])
    expect(keyNameLength(suggested)).toBeLessThanOrEqual(40)
    expect(suggested.endsWith(' (2)')).toBe(true)
  })

  it('refuses an over-long imported name and reports it as such', () => {
    expect(importedKeyName('  Ana  ')).toBe('Ana')
    let thrown
    try {
      importedKeyName('x'.repeat(41))
    } catch (err) {
      thrown = err
    }
    expect(keyReadError(thrown)).toBe('name-too-long')
    expect(keyReadError(new Error('bad format'))).toBe('not-a-key')
    expect(keyReadError(new Error('x'), 'no-key')).toBe('no-key')
  })
})
