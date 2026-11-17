import { describe, expect, it } from 'vitest'
import { createIdentityKeys } from '../../../src/main/sealing'
import { REVOKE_TTL_MS, signRevoke, verifyRevoke } from '../../../src/main/lan/revoke'

const jonas = createIdentityKeys()
const ana = createIdentityKeys()
const mallory = createIdentityKeys()
const trustedByAna = [
  { fingerprint: jonas.pub.fingerprint, label: 'Jonas', sign: jonas.pub.sign, box: jonas.pub.box }
]
const NOW = 1_800_000_000_000
const frame = (who = jonas, over = {}) => ({
  ...signRevoke({ priv: who.priv, fp: jonas.pub.fingerprint, to: ana.pub.fingerprint, at: NOW }),
  ...over
})
const check = (f, now = NOW) =>
  verifyRevoke(f, { trusted: trustedByAna, me: ana.pub.fingerprint, now })

describe('the stopped-sharing notice', () => {
  it('verifies when signed by the trusted key it names, for this recipient', () => {
    expect(check(frame())).toEqual({ fp: jonas.pub.fingerprint, name: 'Jonas' })
  })

  it('is refused when someone else signs it in that key’s name', () => {
    expect(check(frame(mallory))).toBeNull()
  })

  it('is refused for a different recipient', () => {
    const forBen = signRevoke({
      priv: jonas.priv,
      fp: jonas.pub.fingerprint,
      to: 'cc'.repeat(16),
      at: NOW
    })
    expect(check(forBen)).toBeNull()
  })

  it('is refused from a key the recipient does not trust', () => {
    const f = signRevoke({
      priv: mallory.priv,
      fp: mallory.pub.fingerprint,
      to: ana.pub.fingerprint,
      at: NOW
    })
    expect(check(f)).toBeNull()
  })

  it('is refused when its time was changed, stale, or from the future', () => {
    expect(check(frame(jonas, { at: NOW + 1 }))).toBeNull()
    expect(check(frame(), NOW + REVOKE_TTL_MS + 1)).toBeNull()
    expect(check(frame(), NOW - 10 * 60 * 1000)).toBeNull()
  })

  it('is refused with a malformed signature', () => {
    expect(check(frame(jonas, { sig: '!!' }))).toBeNull()
  })
})
