import { describe, expect, it } from 'vitest'
import { formatCode, normalizeCode } from '../../src/shared/pairingCodeText'

describe('pairing code text', () => {
  it('normalises and refuses the same way in both processes', () => {
    expect(normalizeCode(' k7q-4zp ')).toBe('K7Q4ZP')
    expect(normalizeCode('K7Q4Z0')).toBeNull()
    expect(formatCode('K7Q4ZP')).toBe('K7Q 4ZP')
  })
})
