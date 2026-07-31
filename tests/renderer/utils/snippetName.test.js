import { describe, expect, it } from 'vitest'
import { sentenceCaseName, untitledName } from '../../../src/renderer/src/utils/snippetName'

describe('sentenceCaseName', () => {
  it('uppercases the first character', () => {
    expect(sentenceCaseName('auth token')).toBe('Auth token')
    expect(sentenceCaseName('jwt decode helper')).toBe('Jwt decode helper')
  })

  it('leaves everything after the first character alone', () => {
    // The reason this is not title case: these all survive intact.
    expect(sentenceCaseName('iOS build steps')).toBe('IOS build steps')
    expect(sentenceCaseName('curl -X POST examples')).toBe('Curl -X POST examples')
    expect(sentenceCaseName('myVariableName')).toBe('MyVariableName')
  })

  it('is a no-op on names that already start uppercase', () => {
    const already = 'Example — Mermaid diagram'
    expect(sentenceCaseName(already)).toBe(already)
    expect(sentenceCaseName('API keys')).toBe('API keys')
  })

  it('leaves a non-letter opener untouched', () => {
    expect(sentenceCaseName('1password notes')).toBe('1password notes')
    expect(sentenceCaseName('.env template')).toBe('.env template')
  })

  it('is idempotent', () => {
    const once = sentenceCaseName('deploy checklist')
    expect(sentenceCaseName(once)).toBe(once)
  })

  it('handles empty and non-string input without throwing', () => {
    expect(sentenceCaseName('')).toBe('')
    expect(sentenceCaseName(null)).toBe('')
    expect(sentenceCaseName(undefined)).toBe('')
  })

  it('does not split an astral first character in half', () => {
    expect(sentenceCaseName('🚀 launch notes')).toBe('🚀 launch notes')
  })

  it('uppercases a non-ASCII first letter', () => {
    expect(sentenceCaseName('über den wolken')).toBe('Über den wolken')
  })
})

describe('untitledName', () => {
  it('stamps the local date and minute so quick captures stay tellable apart', () => {
    expect(untitledName(new Date(2026, 6, 31, 9, 5))).toBe('Untitled 2026-07-31 09:05')
    expect(untitledName(new Date(2026, 11, 1, 23, 59))).toBe('Untitled 2026-12-01 23:59')
  })

  it('is already sentence-cased, so the save path leaves it alone', () => {
    const n = untitledName(new Date(2026, 0, 2, 3, 4))
    expect(sentenceCaseName(n)).toBe(n)
  })

  it('gives two captures a minute apart different names', () => {
    expect(untitledName(new Date(2026, 6, 31, 9, 5))).not.toBe(
      untitledName(new Date(2026, 6, 31, 9, 6))
    )
  })
})
