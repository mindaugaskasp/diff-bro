import { describe, it, expect } from 'vitest'
import { validateUuid, convertUuid } from '../../../src/renderer/src/utils/uuid'

const CANON = '550e8400-e29b-41d4-a716-446655440000'
const HEX = '550e8400e29b41d4a716446655440000'

describe('validateUuid', () => {
  it('accepts the canonical 8-4-4-4-12 form', () => {
    expect(validateUuid(CANON)).toEqual({ valid: true })
  })
  it('accepts 32 hex digits, upper case, 0x-prefixed, or brace-wrapped', () => {
    expect(validateUuid(HEX).valid).toBe(true)
    expect(validateUuid(HEX.toUpperCase()).valid).toBe(true)
    expect(validateUuid(`0x${HEX}`).valid).toBe(true)
    expect(validateUuid(`{${CANON}}`).valid).toBe(true)
    expect(validateUuid(`  ${CANON}  `).valid).toBe(true)
  })
  it('rejects wrong length, non-hex, and near-misses', () => {
    expect(validateUuid('not-a-uuid').valid).toBe(false)
    expect(validateUuid(HEX.slice(0, 31)).valid).toBe(false)
    expect(validateUuid(`${HEX}ff`).valid).toBe(false)
    expect(validateUuid('550e8400-e29b-41d4-a716-44665544000g').valid).toBe(false)
    expect(validateUuid('').valid).toBe(false)
  })
})

describe('convertUuid', () => {
  it('canonical -> 32-hex (lower case, no dashes)', () => {
    expect(convertUuid(CANON)).toBe(HEX)
  })
  it('32-hex -> canonical, tolerating 0x/braces/case/whitespace', () => {
    expect(convertUuid(HEX)).toBe(CANON)
    expect(convertUuid(`0x${HEX.toUpperCase()}`)).toBe(CANON)
    expect(convertUuid(`{${HEX}}`)).toBe(CANON)
  })
  it('round-trips both directions', () => {
    expect(convertUuid(convertUuid(CANON))).toBe(CANON)
    expect(convertUuid(convertUuid(HEX))).toBe(HEX)
  })
  it('returns the input unchanged when it is not a UUID', () => {
    expect(convertUuid('nope')).toBe('nope')
  })
})
