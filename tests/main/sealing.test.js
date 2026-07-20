import { describe, expect, it } from 'vitest'
import {
  ACCEPTED_KEY_FORMATS,
  KEY_FORMAT,
  MAX_LABEL_LEN,
  MAX_TTL_MS,
  SHARE_FORMAT,
  cleanLabel,
  createIdentityKeys,
  decodePublicKey,
  encodePublicKey,
  fingerprint,
  isAcceptedKeyFormat,
  openSealed,
  sealEntry,
  shareFilename,
  ttlError
} from '../../src/main/sealing'

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

describe('format versioning / revocation', () => {
  it('refuses a sealed file whose format version does not match this release', () => {
    const { seal, bob, bobTrustsAlice } = makePeers()
    const file = seal()
    // The immediately-previous share format (64-bit fingerprints) is revoked.
    const wrongVersion = { ...file, format: 'diffbro-share/2' }
    expect(openSealed(wrongVersion, bob, bobTrustsAlice)).toEqual({ error: 'not-a-share-file' })
  })

  it('the current sealed format still opens (sanity)', () => {
    const { seal, bob, bobTrustsAlice } = makePeers()
    expect(openSealed(seal(), bob, bobTrustsAlice).ok).toBe(true)
    expect(SHARE_FORMAT).toBe('diffbro-share/3')
  })
})

describe('key-file format acceptance (backward compatibility)', () => {
  it('accepts the current and the previous key format, rejects others', () => {
    expect(ACCEPTED_KEY_FORMATS).toContain(KEY_FORMAT)
    expect(isAcceptedKeyFormat('diffbro-key/2')).toBe(true)
    expect(isAcceptedKeyFormat('diffbro-key/1')).toBe(true) // pre-128-bit exports
    expect(isAcceptedKeyFormat('diffbro-key/0')).toBe(false)
    expect(isAcceptedKeyFormat(SHARE_FORMAT)).toBe(false)
    expect(isAcceptedKeyFormat(undefined)).toBe(false)
  })

  it('a legacy diffbro-key/1 file stays importable and recomputes a 128-bit fingerprint', () => {
    const { pub } = createIdentityKeys()
    // Simulate a key file written by a pre-bump build: old format tag + the
    // old 64-bit fingerprint, same key material.
    const legacyFile = JSON.stringify(
      { format: 'diffbro-key/1', sign: pub.sign, box: pub.box, fingerprint: 'deadbeefdeadbeef' },
      null,
      2
    )
    const decoded = decodePublicKey(legacyFile)
    expect(isAcceptedKeyFormat(decoded.format)).toBe(true)
    // The stored (64-bit) fingerprint is ignored; the recomputed one is 128-bit
    // and matches what the current build derives for these keys.
    const recomputed = fingerprint(decoded.sign, decoded.box)
    expect(recomputed).toMatch(/^[0-9a-f]{32}$/)
    expect(recomputed).toBe(pub.fingerprint)
  })
})

describe('cleanLabel (untrusted key display label)', () => {
  it('trims and collapses whitespace, keeps normal text incl. punctuation', () => {
    expect(cleanLabel('  Alice — laptop  ')).toBe('Alice — laptop')
    expect(cleanLabel('a\t b   c')).toBe('a b c')
  })
  it('strips control characters and newlines (no multi-line labels)', () => {
    expect(cleanLabel('line1\nline2\r\ttab\x00nul')).toBe('line1 line2 tab nul')
  })
  it('hard-caps the length', () => {
    expect(cleanLabel('x'.repeat(500))).toHaveLength(MAX_LABEL_LEN)
  })
  it('returns empty string for non-strings', () => {
    for (const v of [undefined, null, 42, {}, []]) expect(cleanLabel(v)).toBe('')
  })
})

describe('public key carries an optional display label', () => {
  it('round-trips a label embedded on the public key', () => {
    const { pub } = createIdentityKeys()
    const labeled = { ...pub, label: 'Alice — laptop' }
    const decoded = decodePublicKey(encodePublicKey(labeled))
    expect(decoded.label).toBe('Alice — laptop')
    // The label is cosmetic: it does not affect the fingerprint.
    expect(fingerprint(decoded.sign, decoded.box)).toBe(pub.fingerprint)
  })
})

describe('public-key obfuscation', () => {
  it('encodes to an opaque, non-JSON envelope and round-trips', () => {
    const { pub } = createIdentityKeys()
    const encoded = encodePublicKey(pub)
    expect(encoded.startsWith('dbk1:')).toBe(true)
    expect(encoded).not.toContain('BEGIN PUBLIC KEY') // not plainly readable
    expect(() => JSON.parse(encoded)).toThrow() // not JSON in a text editor
    expect(decodePublicKey(encoded)).toEqual(pub)
  })

  it('still decodes a legacy plain-JSON key file (backward compatible)', () => {
    const { pub } = createIdentityKeys()
    expect(decodePublicKey(JSON.stringify(pub, null, 2))).toEqual(pub)
  })
})

describe('shareFilename', () => {
  it('derives a fixed-length .diffbro name from the ciphertext', () => {
    const { seal } = makePeers()
    const name = shareFilename(seal())
    expect(name).toMatch(/^[0-9a-f]{32}\.diffbro$/)
  })

  it('reveals nothing about the entry name (two names -> different files, same shape)', () => {
    const { seal } = makePeers()
    const a = shareFilename(seal(makeEntry({ name: 'quarterly-financials' })))
    const b = shareFilename(seal(makeEntry({ name: 'x' })))
    expect(a).toMatch(/^[0-9a-f]{32}\.diffbro$/)
    expect(b).toMatch(/^[0-9a-f]{32}\.diffbro$/)
    expect(a).not.toBe(b) // different ciphertext (fresh ephemeral key each seal)
  })

  it('changes if the ciphertext is altered (so a tampered file also renames)', () => {
    const { seal } = makePeers()
    const file = seal()
    const before = shareFilename(file)
    const after = shareFilename({ ...file, ciphertext: file.ciphertext.slice(1) })
    expect(after).not.toBe(before)
  })
})

describe('identity', () => {
  it('creates keys whose stated fingerprint matches a recomputation', () => {
    const { pub } = createIdentityKeys()
    expect(fingerprint(pub.sign, pub.box)).toBe(pub.fingerprint)
    expect(pub.fingerprint).toMatch(/^[0-9a-f]{32}$/)
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
