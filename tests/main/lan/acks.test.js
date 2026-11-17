import { describe, expect, it } from 'vitest'
import { createIdentityKeys } from '../../../src/main/sealing'
import { digestOf, signAck, verifyAck } from '../../../src/main/lan/acks'

const bob = createIdentityKeys()
const mallory = createIdentityKeys()
const fields = { kind: 'item', digest: digestOf(Buffer.from('sealed bytes')), ok: true, reason: '' }

describe('signed acknowledgements', () => {
  it('verifies against the recipient key it was signed with', () => {
    expect(verifyAck(bob.pub.sign, fields, signAck(bob.priv, fields))).toBe(true)
  })

  it('refuses one signed by anyone else, so a hijacked address cannot claim delivery', () => {
    expect(verifyAck(bob.pub.sign, fields, signAck(mallory.priv, fields))).toBe(false)
  })

  it('refuses one for other bytes, another verdict, or another kind of frame', () => {
    const sig = signAck(bob.priv, fields)
    expect(verifyAck(bob.pub.sign, { ...fields, digest: digestOf(Buffer.from('x')) }, sig)).toBe(
      false
    )
    expect(verifyAck(bob.pub.sign, { ...fields, ok: false }, sig)).toBe(false)
    expect(verifyAck(bob.pub.sign, { ...fields, kind: 'revoke' }, sig)).toBe(false)
  })

  it('refuses a missing or malformed signature', () => {
    expect(verifyAck(bob.pub.sign, fields, undefined)).toBe(false)
    expect(verifyAck(bob.pub.sign, fields, 'not base64 at all')).toBe(false)
  })
})
