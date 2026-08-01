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
  ROTATION_FORMAT,
  openSealed,
  openSealedWith,
  rebuiltPublicKey,
  sealEntry,
  signRotation,
  verifyRotation,
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
    expect(SHARE_FORMAT).toBe('diffbro-share/4')
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
  it('rejects lifetimes past the ceiling', () => {
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
      'keys',
      'tag',
      'to'
    ])
    // The per-recipient wraps carry no plaintext either.
    expect(Object.keys(file.keys[0]).sort()).toEqual(['iv', 'key', 'salt', 'tag', 'to'])
    const raw = JSON.stringify(file)
    for (const probe of ['secret left', 'test diff', 'expiresAt', 'snapshot']) {
      expect(raw).not.toContain(probe)
    }
  })

  it('uses a fresh ephemeral key, content key, salt, iv, and ciphertext per file', () => {
    const { seal } = makePeers()
    const a = seal()
    const b = seal()
    expect(a.epk).not.toBe(b.epk)
    expect(a.keys[0].salt).not.toBe(b.keys[0].salt)
    expect(a.keys[0].key).not.toBe(b.keys[0].key)
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

  it('carries the entry tags through the signed+encrypted roundtrip', () => {
    const { bob, bobTrustsAlice, seal } = makePeers()
    const res = openSealed(seal(makeEntry({ tags: ['release', 'json'] })), bob, bobTrustsAlice, NOW)
    expect(res.ok).toBe(true)
    expect(res.entry.tags).toEqual(['release', 'json'])
  })

  it('a tampered tag list breaks the signature (tags are authenticated)', () => {
    const { bob, bobTrustsAlice, seal } = makePeers()
    const file = seal(makeEntry({ tags: ['release'] }))
    // The payload is inside the GCM ciphertext, so any edit fails decryption
    // before signature checking — either way the file must be rejected.
    const tampered = { ...file, ciphertext: Buffer.from(file.ciphertext, 'base64').toString('hex') }
    expect(openSealed(tampered, bob, bobTrustsAlice, NOW).ok).not.toBe(true)
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
    // The audience is derived from `to`, and both AAD layers commit to it, so a
    // rewritten routing header can only fail — never redirect a sealed file.
    const forged = { ...file, to: [bob.pub.fingerprint.split('').reverse().join('')] }
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

  // A trusted-keys file is not necessarily one this app wrote — the config
  // restore path used to write it unvalidated, and it can be hand-edited. A key
  // that will not parse must be a verdict, never a throw: openSealed rejecting
  // its IPC promise left the user with no message at all.
  it('reports a trusted entry whose key will not parse instead of throwing', () => {
    const { seal, bob, bobTrustsAlice } = makePeers()
    const file = seal()
    const corrupt = [{ ...bobTrustsAlice[0], sign: 'not a PEM at all' }]
    expect(() => openSealed(file, bob, corrupt, NOW)).not.toThrow()
    expect(openSealed(file, bob, corrupt, NOW).error).toBe('bad-trusted-key')
  })

  it('rejects expired payloads and over-long TTLs at import time', () => {
    const { bob, bobTrustsAlice, seal } = makePeers()
    expect(openSealed(seal(), bob, bobTrustsAlice, NOW + 3600_000 + 1).error).toBe('expired')
    const tooLong = seal(makeEntry({ expiresAt: NOW + MAX_TTL_MS + 1 }))
    expect(openSealed(tooLong, bob, bobTrustsAlice, NOW).error).toBe('invalid-ttl')
  })
})

// The sender's chosen expiry travels intact, up to the same week a diff can be
// kept locally. The ceiling moved; it did not go away, and both ends still check.
describe('the sealed lifetime ceiling', () => {
  it('is a week', () => {
    expect(MAX_TTL_MS).toBe(7 * 24 * 3600 * 1000)
  })

  it('accepts the lifetimes the save dialog offers, up to a week', () => {
    for (const hours of [1, 8, 24, 48, 72, 168]) {
      const entry = makeEntry({ createdAt: NOW, expiresAt: NOW + hours * 3600 * 1000 })
      expect(ttlError(entry, NOW), `${hours} h should seal`).toBeNull()
    }
  })

  it('still refuses anything past it, at both ends', () => {
    const { bob, bobTrustsAlice, seal } = makePeers()
    const entry = makeEntry({ createdAt: NOW, expiresAt: NOW + MAX_TTL_MS + 1 })
    expect(ttlError(entry, NOW)).toBe('invalid-ttl')
    expect(openSealed(seal(entry), bob, bobTrustsAlice, NOW).error).toBe('invalid-ttl')
  })

  it('opens a week-long share end to end', () => {
    const { bob, bobTrustsAlice, seal } = makePeers()
    const entry = makeEntry({ createdAt: NOW, expiresAt: NOW + 7 * 24 * 3600 * 1000 })
    const opened = openSealed(seal(entry), bob, bobTrustsAlice, NOW)
    expect(opened.error).toBeUndefined()
    expect(opened.entry.expiresAt).toBe(entry.expiresAt)
  })
})

// One diff sealed for a whole team. The content is encrypted once under a random
// content key, and that key is wrapped per recipient — so the file grows by a
// key, not by a copy of the diff. Every binding the single-recipient format had
// still holds: sign-then-encrypt, and the AUDIENCE (the whole recipient set) is
// what the signature and both AAD layers commit to.
function makeTeam(count = 3) {
  const alice = createIdentityKeys()
  const members = Array.from({ length: count }, () => createIdentityKeys())
  const trustsAlice = [
    { fingerprint: alice.pub.fingerprint, label: 'alice', sign: alice.pub.sign, box: alice.pub.box }
  ]
  const seal = (entry = makeEntry(), who = members) =>
    sealEntry(
      entry,
      { priv: alice.priv, fingerprint: alice.pub.fingerprint },
      who.map((m) => ({ fingerprint: m.pub.fingerprint, box: m.pub.box }))
    )
  return { alice, members, trustsAlice, seal }
}

describe('multi-recipient sealing', () => {
  it('every named recipient opens the same file and gets the same diff', () => {
    const { members, trustsAlice, seal } = makeTeam(3)
    const entry = makeEntry()
    const file = seal(entry)

    for (const m of members) {
      const opened = openSealed(file, m, trustsAlice, NOW)
      expect(opened.ok).toBe(true)
      expect(opened.entry).toEqual(entry)
      expect(opened.from).toBe('alice')
    }
  })

  it('encrypts the diff once, however many recipients there are', () => {
    const { seal, members } = makeTeam(5)
    const one = seal(makeEntry(), members.slice(0, 1))
    const five = seal(makeEntry(), members)
    // The payload is not duplicated per recipient; only the wrapped keys are.
    expect(five.ciphertext.length).toBe(one.ciphertext.length)
    expect(five.keys).toHaveLength(5)
    expect(one.keys).toHaveLength(1)
  })

  it('refuses someone who is not in the audience', () => {
    const { seal, trustsAlice } = makeTeam(2)
    const stranger = createIdentityKeys()
    expect(openSealed(seal(), stranger, trustsAlice, NOW)).toEqual({ error: 'not-for-you' })
  })

  it('a single recipient is just an audience of one, and still opens', () => {
    const { members, trustsAlice, seal } = makeTeam(1)
    expect(openSealed(seal(), members[0], trustsAlice, NOW).ok).toBe(true)
  })

  it('accepts one recipient passed on its own, not in a list', () => {
    const { bob, bobTrustsAlice, seal } = makePeers()
    expect(openSealed(seal(), bob, bobTrustsAlice, NOW).ok).toBe(true)
  })

  // The re-addressing guard: the audience is committed to by the signature AND
  // by both AAD layers, so the recipient list cannot be edited after the fact.
  it('refuses a file whose recipient list was edited', () => {
    const { members, trustsAlice, seal } = makeTeam(3)
    const file = seal()
    // Drop a member who is NOT the one opening it, so the failure can only be
    // the audience binding rather than "you are not on the list".
    const me = members[0].pub.fingerprint
    const victim = file.to.find((fp) => fp !== me)
    const dropped = {
      ...file,
      to: file.to.filter((fp) => fp !== victim),
      keys: file.keys.filter((k) => k.to !== victim)
    }
    expect(openSealed(dropped, members[0], trustsAlice, NOW).error).toBe('tampered')

    const stranger = createIdentityKeys()
    const widened = { ...file, to: [...file.to, stranger.pub.fingerprint] }
    expect(openSealed(widened, members[0], trustsAlice, NOW).error).toBe('tampered')
  })

  it('refuses a wrapped key lifted from another recipient', () => {
    const { members, trustsAlice, seal } = makeTeam(2)
    const file = seal()
    const me = members[0].pub.fingerprint
    const other = file.keys.find((k) => k.to !== me)
    // My slot, carrying somebody else's wrapped key: the per-recipient AAD is
    // what makes that unusable rather than merely wrong.
    const swapped = {
      ...file,
      keys: file.keys.map((k) => (k.to === me ? { ...other, to: me } : k))
    }
    expect(openSealed(swapped, members[0], trustsAlice, NOW).error).toBe('tampered')
  })

  it('refuses a tampered payload for every recipient', () => {
    const { members, trustsAlice, seal } = makeTeam(2)
    const file = seal()
    const bad = Buffer.from(file.ciphertext, 'base64')
    bad[0] ^= 0xff
    const tampered = { ...file, ciphertext: bad.toString('base64') }
    for (const m of members) {
      expect(openSealed(tampered, m, trustsAlice, NOW).error).toBe('tampered')
    }
  })

  it('refuses a signature from someone the recipient does not trust', () => {
    const { members, seal } = makeTeam(2)
    expect(openSealed(seal(), members[0], [], NOW).error).toBe('unknown-signer')
  })

  it('names the same file whatever recipient asks, and changes when the set does', () => {
    const { seal, members } = makeTeam(3)
    const file = seal()
    expect(shareFilename(file)).toMatch(/^[0-9a-f]{32}\.diffbro$/)
    expect(shareFilename(seal(makeEntry(), members.slice(0, 2)))).not.toBe(shareFilename(file))
  })

  it('rejects a seal addressed to nobody', () => {
    const { alice } = makeTeam(1)
    expect(() =>
      sealEntry(makeEntry(), { priv: alice.priv, fingerprint: alice.pub.fingerprint }, [])
    ).toThrow()
  })

  it('deduplicates a recipient named twice', () => {
    const { members, trustsAlice, seal } = makeTeam(1)
    const file = seal(makeEntry(), [members[0], members[0]])
    expect(file.keys).toHaveLength(1)
    expect(openSealed(file, members[0], trustsAlice, NOW).ok).toBe(true)
  })
})

// --- key rotation ---------------------------------------------------------
// Rotation exists for one threat only: a leaked private key must stop being
// able to speak for you. It does NOT make past shares unreadable — those were
// encrypted to the RECIPIENT's key; yours only signed them. The tests below
// pin both halves of that, because the wrong belief about it is the dangerous
// one.
describe('key rotation', () => {
  const rotate = () => {
    const older = createIdentityKeys()
    const newer = createIdentityKeys()
    const record = signRotation({
      oldPriv: older.priv,
      oldFp: older.pub.fingerprint,
      newPriv: newer.priv,
      newFp: newer.pub.fingerprint
    })
    return { older, newer, record }
  }

  it('is vouched for by BOTH the old key and the new one', () => {
    const { older, newer, record } = rotate()
    expect(record.from).toBe(older.pub.fingerprint)
    expect(record.to).toBe(newer.pub.fingerprint)
    expect(verifyRotation(record, older.pub.sign, newer.pub)).toBe(true)
  })

  // Without the old key's signature, anyone could announce themselves as the
  // successor to a key you trust.
  it('is rejected when the previous key did not sign it', () => {
    const { older, newer, record } = rotate()
    const impostor = createIdentityKeys()
    const forged = signRotation({
      oldPriv: impostor.priv,
      oldFp: older.pub.fingerprint,
      newPriv: newer.priv,
      newFp: newer.pub.fingerprint
    })
    expect(verifyRotation(forged, older.pub.sign, newer.pub)).toBe(false)
    // …and the genuine one still fails against the wrong predecessor.
    expect(verifyRotation(record, impostor.pub.sign, newer.pub)).toBe(false)
  })

  // Without the new key's own signature, a leaked record could be re-pointed
  // at a key its holder never controlled.
  it('is rejected when the new key did not claim it', () => {
    const { older, newer, record } = rotate()
    const other = createIdentityKeys()
    expect(
      verifyRotation({ ...record, bySelf: record.byPrevious }, older.pub.sign, newer.pub)
    ).toBe(false)
    // A record for a different key does not vouch for this one.
    expect(verifyRotation(record, older.pub.sign, other.pub)).toBe(false)
  })

  it('is rejected when any field it covers is edited', () => {
    const { older, newer, record } = rotate()
    for (const edit of [{ at: record.at + 1 }, { from: 'f'.repeat(32) }, { format: 'nope' }]) {
      expect(verifyRotation({ ...record, ...edit }, older.pub.sign, newer.pub)).toBe(false)
    }
  })

  it('is rejected outright when it is not a rotation record at all', () => {
    const { older, newer } = rotate()
    for (const junk of [null, undefined, {}, { format: ROTATION_FORMAT }, 'string']) {
      expect(verifyRotation(junk, older.pub.sign, newer.pub)).toBe(false)
    }
  })
})

describe('openSealedWith', () => {
  const trusted = (id, label) => ({ ...id.pub, fingerprint: id.pub.fingerprint, label })

  it('opens with the current identity', () => {
    const sender = createIdentityKeys()
    const me = createIdentityKeys()
    const file = sealEntry(
      makeEntry(),
      { priv: sender.priv, fingerprint: sender.pub.fingerprint },
      [trusted(me, 'me')]
    )
    const out = openSealedWith(file, [me], [trusted(sender, 'sender')])
    expect(out.error).toBeUndefined()
    expect(out.entry.name).toBe(makeEntry().name)
  })

  // Rotating a key must not destroy diffs already sent to the old one. A
  // retired key still decrypts; it is simply never used to seal or sign again.
  it('still opens a diff sealed to a key that has since been retired', () => {
    const sender = createIdentityKeys()
    const retired = createIdentityKeys()
    const current = createIdentityKeys()
    const file = sealEntry(
      makeEntry(),
      { priv: sender.priv, fingerprint: sender.pub.fingerprint },
      [trusted(retired, 'me-before')]
    )

    expect(openSealed(file, current, [trusted(sender, 's')]).error).toBe('not-for-you')
    expect(openSealedWith(file, [current, retired], [trusted(sender, 's')]).error).toBeUndefined()
  })

  // A real verdict about the file must not be masked by trying more keys.
  it('reports a tampered file rather than moving on to the next key', () => {
    const sender = createIdentityKeys()
    const me = createIdentityKeys()
    const spare = createIdentityKeys()
    const file = sealEntry(
      makeEntry(),
      { priv: sender.priv, fingerprint: sender.pub.fingerprint },
      [trusted(me, 'me')]
    )
    file.ciphertext = Buffer.from('tampered').toString('base64')
    expect(openSealedWith(file, [me, spare], [trusted(sender, 's')]).error).toBe('tampered')
  })

  it('says "not for you" when none of this machine’s keys is addressed', () => {
    const sender = createIdentityKeys()
    const them = createIdentityKeys()
    const file = sealEntry(
      makeEntry(),
      { priv: sender.priv, fingerprint: sender.pub.fingerprint },
      [trusted(them, 'them')]
    )
    expect(openSealedWith(file, [createIdentityKeys()], [trusted(sender, 's')]).error).toBe(
      'not-for-you'
    )
    expect(openSealedWith(file, [], []).error).toBe('not-for-you')
  })
})

// A key file is rebuilt to the current format on import, and that rebuild used
// to list its fields by hand — dropping the rotation record, which made the
// "this key replaces one you trust" note unreachable in every path.
describe('rebuiltPublicKey', () => {
  it('carries the rotation record through', () => {
    const older = createIdentityKeys()
    const newer = createIdentityKeys()
    const rotation = signRotation({
      oldPriv: older.priv,
      oldFp: older.pub.fingerprint,
      newPriv: newer.priv,
      newFp: newer.pub.fingerprint
    })
    const rebuilt = rebuiltPublicKey({ ...newer.pub, rotation })

    expect(rebuilt.rotation).toEqual(rotation)
    // …and it still verifies after the round trip, which is the point.
    expect(verifyRotation(rebuilt.rotation, older.pub.sign, rebuilt)).toBe(true)
  })

  it('normalises the format and keeps only key material', () => {
    const id = createIdentityKeys()
    const rebuilt = rebuiltPublicKey({ ...id.pub, format: 'diffbro-key/1', label: 'whatever' })
    expect(rebuilt.format).toBe(KEY_FORMAT)
    // A label from the FILE is untrusted display text; the importer names the key.
    expect(rebuilt.label).toBeUndefined()
    expect(Object.keys(rebuilt).sort()).toEqual(['box', 'format', 'sign'])
  })

  it('omits rotation entirely when the key has none', () => {
    expect('rotation' in rebuiltPublicKey(createIdentityKeys().pub)).toBe(false)
  })
})
