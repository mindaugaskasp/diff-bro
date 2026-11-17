import { describe, expect, it } from 'vitest'
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  codesMatch,
  commitmentOf,
  formatCode,
  isRevealValid,
  newNonce,
  normalizeCode,
  pairingCode
} from '../../../src/main/lan/pairingCode'

const parts = () => ({
  holderFp: 'aa'.repeat(16),
  adderFp: 'bb'.repeat(16),
  holderNonce: newNonce(),
  adderNonce: newNonce()
})

describe('pairing code', () => {
  it('is six characters from the unambiguous alphabet', () => {
    const code = pairingCode(parts())
    expect(code).toHaveLength(CODE_LENGTH)
    for (const ch of code) expect(CODE_ALPHABET).toContain(ch)
    expect(CODE_ALPHABET).not.toMatch(/[01ILOU]/)
  })

  it('is the same on both sides for the same inputs', () => {
    const p = parts()
    expect(pairingCode(p)).toBe(pairingCode({ ...p }))
  })

  it('changes when any input changes', () => {
    const p = parts()
    const code = pairingCode(p)
    expect(pairingCode({ ...p, adderNonce: newNonce() })).not.toBe(code)
    expect(pairingCode({ ...p, holderNonce: newNonce() })).not.toBe(code)
    expect(pairingCode({ ...p, adderFp: 'cc'.repeat(16) })).not.toBe(code)
    expect(pairingCode({ ...p, holderFp: p.adderFp, adderFp: p.holderFp })).not.toBe(code)
  })

  it('is different for every request', () => {
    const codes = new Set(Array.from({ length: 50 }, () => pairingCode(parts())))
    expect(codes.size).toBeGreaterThan(45)
  })
})

describe('commit and reveal', () => {
  it('accepts the nonce that was committed to', () => {
    const nonce = newNonce()
    expect(isRevealValid(commitmentOf(nonce), nonce)).toBe(true)
  })

  it('refuses a different nonce', () => {
    expect(isRevealValid(commitmentOf(newNonce()), newNonce())).toBe(false)
  })

  it('refuses malformed input without throwing', () => {
    expect(isRevealValid('short', newNonce())).toBe(false)
    expect(isRevealValid(commitmentOf(newNonce()), 42)).toBe(false)
    expect(isRevealValid(undefined, undefined)).toBe(false)
  })

  it('makes 32-byte nonces', () => {
    expect(Buffer.from(newNonce(), 'base64')).toHaveLength(32)
  })
})

describe('typed and pasted codes', () => {
  it('normalises spacing, dashes and case', () => {
    expect(normalizeCode('k7q 4zp')).toBe('K7Q4ZP')
    expect(normalizeCode(' K7Q-4ZP\n')).toBe('K7Q4ZP')
  })

  it('refuses anything that is not a pairing code', () => {
    expect(normalizeCode('K7Q4Z')).toBeNull()
    expect(normalizeCode('K7Q4ZPX')).toBeNull()
    expect(normalizeCode('K7Q 4Z0')).toBeNull()
    expect(normalizeCode('hello world, here is a long clipboard')).toBeNull()
    expect(normalizeCode(null)).toBeNull()
  })

  it('matches only the same code', () => {
    expect(codesMatch('K7Q4ZP', 'k7q 4zp')).toBe(true)
    expect(codesMatch('K7Q4ZP', 'K7Q4ZR')).toBe(false)
    expect(codesMatch('K7Q4ZP', 'nope')).toBe(false)
  })

  it('formats in two groups of three', () => {
    expect(formatCode('K7Q4ZP')).toBe('K7Q 4ZP')
  })
})
