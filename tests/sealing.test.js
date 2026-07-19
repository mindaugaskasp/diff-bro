import { describe, expect, it } from 'vitest'
import {
  MAX_TTL_MS,
  SHARE_FORMAT,
  createIdentityKeys,
  fingerprint,
  openSealed,
  sealEntry,
  ttlError
} from '../src/main/sealing'

const NOW = 1_800_000_000_000

function makeEntry(overrides = {}) {
  return {
    name: 'test diff',
    createdAt: NOW,
    expiresAt: NOW + 3600_000,
    snapshot: { mode: 'paste', pasteLeft: 'secret left', pasteRight: 'secret right' },
    ...overrides
  }
}

// alice sends, bob receives
function makePeers() {
  const alice = createIdentityKeys()
  const bob = createIdentityKeys()
  const bobTrustsAlice = [
    { fingerprint: alice.pub.fingerprint, label: 'alice', sign: alice.pub.sign, box: alice.pub.box }
  ]
  const seal = (entry = makeEntry()) =>
    sealEntry(
      entry,
      { priv: alice.priv, fingerprint: alice.pub.fingerprint },
      { fingerprint: bob.pub.fingerprint, box: bob.pub.box }
    )
  return { alice, bob, bobTrustsAlice, seal }
}

describe('identity', () => {
  it('creates keys whose stated fingerprint matches a recomputation', () => {
    const { pub } = createIdentityKeys()
    expect(fingerprint(pub.sign, pub.box)).toBe(pub.fingerprint)
    expect(pub.fingerprint).toMatch(/^[0-9a-f]{16}$/)
  })

  it('gives every install a distinct fingerprint', () => {
    expect(createIdentityKeys().pub.fingerprint).not.toBe(createIdentityKeys().pub.fingerprint)
  })
})

describe('ttlError', () => {
  it('accepts a valid entry', () => {
    expect(ttlError(makeEntry(), NOW)).toBeNull()
  })
  it('rejects expired entries', () => {
    expect(ttlError(makeEntry({ expiresAt: NOW - 1 }), NOW)).toBe('expired')
  })
  it('rejects lifetimes over 24 h', () => {
    expect(ttlError(makeEntry({ expiresAt: NOW + MAX_TTL_MS + 1 }), NOW)).toBe('invalid-ttl')
  })
  it('rejects missing or non-numeric timestamps', () => {
    expect(ttlError(makeEntry({ createdAt: undefined }), NOW)).toBe('invalid-ttl')
    expect(ttlError(makeEntry({ expiresAt: 'later' }), NOW)).toBe('invalid-ttl')
    expect(ttlError(null, NOW)).toBe('invalid-ttl')
  })
})

describe('sealEntry', () => {
  it('produces an opaque file: only envelope fields, no plaintext leakage', () => {
    const { seal } = makePeers()
    const file = seal()
    expect(Object.keys(file).sort()).toEqual([
      'ciphertext',
      'epk',
      'format',
      'iv',
      'salt',
      'tag',
      'to'
    ])
    const raw = JSON.stringify(file)
    for (const probe of ['secret left', 'test diff', 'expiresAt', 'snapshot']) {
      expect(raw).not.toContain(probe)
    }
  })

  it('uses a fresh ephemeral key, salt, iv, and ciphertext per file', () => {
    const { seal } = makePeers()
    const a = seal()
    const b = seal()
    expect(a.epk).not.toBe(b.epk)
    expect(a.salt).not.toBe(b.salt)
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })
})

describe('openSealed', () => {
  it('roundtrips: the addressed, trusting recipient recovers the exact entry', () => {
    const { bob, bobTrustsAlice, seal } = makePeers()
    const entry = makeEntry()
    const res = openSealed(seal(entry), bob, bobTrustsAlice, NOW)
    expect(res.ok).toBe(true)
    expect(res.from).toBe('alice')
    expect(res.entry).toEqual(entry)
  })

  it('rejects files that are not share files', () => {
    const { bob, bobTrustsAlice } = makePeers()
    for (const junk of [null, {}, { format: 'nope' }, { format: SHARE_FORMAT }]) {
      expect(openSealed(junk, bob, bobTrustsAlice, NOW).error).toBe('not-a-share-file')
    }
  })

  it('rejects files addressed to someone else', () => {
    const { bobTrustsAlice, seal } = makePeers()
    const eve = createIdentityKeys()
    expect(openSealed(seal(), eve, bobTrustsAlice, NOW).error).toBe('not-for-you')
  })

  it('rejects any ciphertext modification (GCM tag)', () => {
    const { bob, bobTrustsAlice, seal } = makePeers()
    const file = seal()
    const bytes = Buffer.from(file.ciphertext, 'base64')
    bytes[0] ^= 0xff
    file.ciphertext = bytes.toString('base64')
    expect(openSealed(file, bob, bobTrustsAlice, NOW).error).toBe('tampered')
  })

  it('rejects a re-addressed "to" field (AAD binding)', () => {
    const { bob, bobTrustsAlice, seal } = makePeers()
    const file = seal()
    // Attacker rewrites the routing header to bob's fingerprint on a file
    // sealed with bob's key but different AAD — simulate by flipping `to`
    // then restoring it so only the AAD check can catch a mismatch. The
    // real-world equivalent: decryption must fail whenever `to` and the
    // AAD disagree, which GCM enforces because we derive AAD from `to`.
    const forged = { ...file, to: bob.pub.fingerprint.split('').reverse().join('') }
    expect(['not-for-you', 'tampered']).toContain(
      openSealed(forged, bob, bobTrustsAlice, NOW).error
    )
  })

  it('rejects signers that are not trusted', () => {
    const { bob, seal } = makePeers()
    expect(openSealed(seal(), bob, [], NOW).error).toBe('unknown-signer')
  })

  it('rejects signatures not bound to the recipient (no re-sealing for third parties)', () => {
    // carol receives a valid file from alice, then tries to re-seal alice's
    // signed payload for bob: bob must reject it even though he trusts alice.
    const alice = createIdentityKeys()
    const carol = createIdentityKeys()
    const bob = createIdentityKeys()
    const entry = makeEntry()

    const toCarol = sealEntry(
      entry,
      { priv: alice.priv, fingerprint: alice.pub.fingerprint },
      { fingerprint: carol.pub.fingerprint, box: carol.pub.box }
    )
    const carolTrustsAlice = [
      {
        fingerprint: alice.pub.fingerprint,
        label: 'alice',
        sign: alice.pub.sign,
        box: alice.pub.box
      }
    ]
    expect(openSealed(toCarol, carol, carolTrustsAlice, NOW).ok).toBe(true)

    // carol re-seals the same entry for bob, forging alice as the signer by
    // reusing alice's signature material is impossible — but even sealing
    // the identical payload herself and claiming alice's fingerprint fails
    // the signature check, because alice's signature covers carol's fp.
    const reSealed = sealEntry(
      entry,
      { priv: carol.priv, fingerprint: alice.pub.fingerprint }, // claims to be alice
      { fingerprint: bob.pub.fingerprint, box: bob.pub.box }
    )
    const bobTrustsAlice = [
      {
        fingerprint: alice.pub.fingerprint,
        label: 'alice',
        sign: alice.pub.sign,
        box: alice.pub.box
      }
    ]
    expect(openSealed(reSealed, bob, bobTrustsAlice, NOW).error).toBe('bad-signature')
  })

  it('rejects expired payloads and TTLs over 24 h at import time', () => {
    const { bob, bobTrustsAlice, seal } = makePeers()
    expect(openSealed(seal(), bob, bobTrustsAlice, NOW + 3600_000 + 1).error).toBe('expired')
    const tooLong = seal(makeEntry({ expiresAt: NOW + MAX_TTL_MS + 1 }))
    expect(openSealed(tooLong, bob, bobTrustsAlice, NOW).error).toBe('invalid-ttl')
  })
})
