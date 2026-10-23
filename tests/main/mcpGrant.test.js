import { describe, expect, it } from 'vitest'
import { randomBytes } from 'crypto'
import { GRANT_OFF, SCOPES, signGrant, verifyGrant } from '../../src/main/mcpGrant'

const KEY = randomBytes(32)
const allOn = Object.fromEntries(SCOPES.map((s) => [s, true]))

describe('claude connection grant', () => {
  it('roundtrips a signed grant', () => {
    const record = signGrant(KEY, { enabled: true, scopes: { snippets: true } }, 1000)
    expect(verifyGrant(KEY, record)).toEqual({
      enabled: true,
      scopes: { ...GRANT_OFF.scopes, snippets: true }
    })
  })

  it('treats a missing or malformed record as off', () => {
    expect(verifyGrant(KEY, null)).toEqual(GRANT_OFF)
    expect(verifyGrant(KEY, { enabled: true })).toEqual(GRANT_OFF)
    expect(verifyGrant(KEY, 'yes')).toEqual(GRANT_OFF)
  })

  it('refuses a grant someone switched on by editing the file', () => {
    const record = signGrant(KEY, { enabled: false, scopes: {} }, 1000)
    expect(verifyGrant(KEY, { ...record, enabled: true, scopes: allOn })).toEqual(GRANT_OFF)
  })

  it('refuses a scope widened after signing', () => {
    const record = signGrant(KEY, { enabled: true, scopes: { snippets: true } }, 1000)
    expect(verifyGrant(KEY, { ...record, scopes: allOn })).toEqual(GRANT_OFF)
  })

  it('refuses a grant signed under another vault key', () => {
    const record = signGrant(randomBytes(32), { enabled: true, scopes: allOn }, 1000)
    expect(verifyGrant(KEY, record)).toEqual(GRANT_OFF)
  })

  it('keeps every scope off while the master switch is off', () => {
    const record = signGrant(KEY, { enabled: false, scopes: allOn }, 1000)
    expect(verifyGrant(KEY, record)).toEqual(GRANT_OFF)
  })

  it('drops scope names it does not know', () => {
    const record = signGrant(KEY, { enabled: true, scopes: { secrets: true } }, 1000)
    expect(verifyGrant(KEY, record).scopes).toEqual(GRANT_OFF.scopes)
  })
})
