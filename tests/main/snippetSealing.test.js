import { describe, expect, it } from 'vitest'
import { createCipheriv, createDecipheriv } from 'crypto'
import { createIdentityKeys } from '../../src/main/sealing'
import { deriveKey } from '../../src/main/kdf'
import {
  SNIPPET_FORMAT,
  SNIPPET_LIMITS,
  openSnippets,
  sealSnippets,
  validateSnippetBundle
} from '../../src/main/snippetSealing'

const BUNDLE = {
  snippets: [
    { name: 'find user', content: 'SELECT * FROM users', language: 'sql', tags: ['sql'] },
    { name: 'todo', content: '# Todo\n- [ ] ship it', language: 'markdown', tags: [] }
  ],
  tags: { sql: { color: '#4c8dff' } }
}

describe('sealSnippets / openSnippets', () => {
  it('round-trips a bundle with the correct passphrase', async () => {
    const sender = createIdentityKeys()
    const file = await sealSnippets(BUNDLE, 'correct horse battery staple', sender)
    const trusted = [
      { fingerprint: sender.pub.fingerprint, label: 'Sender', sign: sender.pub.sign }
    ]
    const result = await openSnippets(file, 'correct horse battery staple', trusted)
    expect(result).toEqual({ ok: true, bundle: BUNDLE, signer: sender.pub.fingerprint })
  })

  it('carries the expected format tag and pinned scrypt cost', async () => {
    const sender = createIdentityKeys()
    const file = await sealSnippets(BUNDLE, 'pw', sender)
    expect(file.format).toBe(SNIPPET_FORMAT)
    expect(file.kdf).toEqual({ N: 2 ** 17, r: 8, p: 1 })
  })

  it('fails to open with the wrong passphrase', async () => {
    const sender = createIdentityKeys()
    const file = await sealSnippets(BUNDLE, 'right-passphrase', sender)
    const result = await openSnippets(file, 'wrong-passphrase')
    expect(result.ok).toBeUndefined()
    expect(result.error).toBeTruthy()
  })

  it('rejects a file with a tampered ciphertext (GCM auth tag)', async () => {
    const sender = createIdentityKeys()
    const file = await sealSnippets(BUNDLE, 'pw', sender)
    const bytes = Buffer.from(file.ciphertext, 'base64')
    bytes[0] ^= 0xff
    file.ciphertext = bytes.toString('base64')
    expect((await openSnippets(file, 'pw')).ok).toBeUndefined()
  })

  it('rejects a file whose signature does not match the embedded key (forged after signing)', async () => {
    // Sign with alice, then splice in bob's public key to try to make the
    // signature look like it came from someone else — decrypts fine (same
    // passphrase), but signature verification against the swapped key fails.
    const alice = createIdentityKeys()
    const bob = createIdentityKeys()
    const file = await sealSnippets(BUNDLE, 'pw', alice)

    // Re-encrypt an envelope with bob's key substituted for alice's, reusing
    // the same salt/iv (and the same pinned scrypt cost) so decryption still
    // succeeds and only the embedded signerKey differs.
    const salt = Buffer.from(file.salt, 'base64')
    const key = await deriveKey('pw', salt)
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(file.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(file.tag, 'base64'))
    const inner = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(file.ciphertext, 'base64')),
        decipher.final()
      ]).toString()
    )
    inner.signerKey = bob.pub.sign

    const iv2 = Buffer.from(file.iv, 'base64')
    const cipher = createCipheriv('aes-256-gcm', key, iv2)
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(inner))),
      cipher.final()
    ])
    const tampered = {
      ...file,
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64')
    }

    expect(await openSnippets(tampered, 'pw')).toEqual({ error: 'bad-signature' })
  })

  it('rejects a file with an unrecognized format tag', async () => {
    expect(await openSnippets({ format: 'something-else' }, 'pw')).toEqual({
      error: 'not-a-snippet-file'
    })
  })

  it('rejects malformed input without throwing', async () => {
    expect(await openSnippets(null, 'pw')).toEqual({ error: 'not-a-snippet-file' })
    expect(await openSnippets({}, 'pw')).toEqual({ error: 'not-a-snippet-file' })
    expect(await openSnippets('not an object', 'pw')).toEqual({ error: 'not-a-snippet-file' })
  })

  it('rejects a decryptable-but-malformed bundle (hostile sender, right passphrase)', async () => {
    // A file can be perfectly decryptable and correctly signed yet still carry
    // a bundle we must not trust: the passphrase gates confidentiality, not shape.
    const sender = createIdentityKeys()
    const file = await sealSnippets({ snippets: [{ name: 'n', content: 12345 }] }, 'pw', sender)
    expect(await openSnippets(file, 'pw')).toEqual({ error: 'malformed' })
  })

  it('rejects a decryptable bundle that exceeds the size caps', async () => {
    const sender = createIdentityKeys()
    const huge = 'a'.repeat(SNIPPET_LIMITS.contentBytes + 1)
    const file = await sealSnippets({ snippets: [{ name: 'big', content: huge }] }, 'pw', sender)
    expect(await openSnippets(file, 'pw')).toEqual({ error: 'too-large' })
  })
})

describe('validateSnippetBundle', () => {
  const ok = (bundle) => expect(validateSnippetBundle(bundle)).toBeNull()
  const bad = (bundle, code) => expect(validateSnippetBundle(bundle)).toBe(code)

  it('accepts a well-formed tags bundle', () => {
    ok({ snippets: [] })
    ok({ snippets: [{ name: 'n', content: 'x' }] }) // language + tags optional
    ok({ snippets: [{ name: 'n', content: 'x', language: 'sql', tags: ['a', 'b'] }] })
    ok({ snippets: [{ name: 'n', content: 'x', tags: ['a'] }], tags: { a: { color: '#4c8dff' } } })
  })

  it('still accepts a legacy categories bundle (old exports)', () => {
    ok({ categories: [] })
    ok({ categories: [{ name: 'c', snippets: [{ name: 'n', content: 'x', language: 'sql' }] }] })
  })

  it('rejects non-object / wrong-shape bundles as malformed', () => {
    for (const b of [null, undefined, 'str', 42, {}, { snippets: 'nope' }]) bad(b, 'malformed')
  })

  it('rejects wrong field types as malformed', () => {
    bad({ snippets: [{ name: 5, content: 'x' }] }, 'malformed')
    bad({ snippets: [{ name: 'n', content: 7 }] }, 'malformed')
    bad({ snippets: [{ name: 'n', content: 'x', language: 9 }] }, 'malformed')
    bad({ snippets: [{ name: 'n', content: 'x', tags: 'not-array' }] }, 'malformed')
    bad({ snippets: [{ name: 'n', content: 'x', tags: [5] }] }, 'malformed')
    bad({ snippets: [], tags: 'nope' }, 'malformed')
  })

  it('enforces count and size caps as too-large', () => {
    bad(
      { snippets: Array(SNIPPET_LIMITS.snippets + 1).fill({ name: 'n', content: 'x' }) },
      'too-large'
    )
    bad(
      {
        snippets: [
          { name: 'n', content: 'x', tags: Array(SNIPPET_LIMITS.tagsPerSnippet + 1).fill('t') }
        ]
      },
      'too-large'
    )
    bad(
      { snippets: [{ name: 'n', content: 'a'.repeat(SNIPPET_LIMITS.contentBytes + 1) }] },
      'too-large'
    )
  })

  it('enforces the whole-bundle total content cap', () => {
    const chunk = 'a'.repeat(SNIPPET_LIMITS.contentBytes)
    const one = { name: 'n', content: chunk }
    const count = Math.ceil(SNIPPET_LIMITS.totalContentBytes / SNIPPET_LIMITS.contentBytes) + 1
    bad({ snippets: Array(count).fill(one) }, 'too-large')
  })
})

// The forgery the test above LOOKS like it covers but does not. That one swaps
// `signerKey` while keeping Alice's signature, so verification fails for the
// wrong reason. This keeps the key and the signature consistent — Mallory signs
// with her own key — and rewrites only the `signer` CLAIM to Alice's
// fingerprint, which is public (it is printed on every .diffbrokey). The
// renderer matches that claim against the trust store to print "Signed by
// trusted key Alice", so an unbound claim is an impersonation of a trusted
// sender, and snippets are code the user pastes and runs.
//
// sealing.js gets this right for sealed diffs: it resolves the verifying key
// FROM the local trust store by inner.signer and only then verifies.
describe('openSnippets signer attribution', () => {
  const reseal = async (file, passphrase, mutate) => {
    const salt = Buffer.from(file.salt, 'base64')
    const key = await deriveKey(passphrase, salt)
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(file.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(file.tag, 'base64'))
    const inner = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(file.ciphertext, 'base64')),
        decipher.final()
      ]).toString()
    )
    mutate(inner)
    const cipher = createCipheriv('aes-256-gcm', key, Buffer.from(file.iv, 'base64'))
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(inner))),
      cipher.final()
    ])
    return {
      ...file,
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64')
    }
  }

  it('refuses a bundle whose signer claim does not match the key that signed it', async () => {
    const alice = createIdentityKeys()
    const mallory = createIdentityKeys()

    // Mallory seals with her own key, then claims to be Alice.
    const file = await sealSnippets(BUNDLE, 'pw', mallory)
    const forged = await reseal(file, 'pw', (inner) => {
      inner.signer = alice.pub.fingerprint
    })

    // Alice IS trusted here — that is what makes the claim worth forging.
    const trusted = [{ fingerprint: alice.pub.fingerprint, label: 'Alice', sign: alice.pub.sign }]
    const result = await openSnippets(forged, 'pw', trusted)
    // It still opens (the passphrase is right and it really is signed), but it
    // must NOT be attributed to Alice.
    expect(result.signer).not.toBe(alice.pub.fingerprint)
    expect(result.signer).toBeNull()
  })

  // The honest case still works: an unmodified bundle reports the real signer.
  it('reports the true signer for an untampered bundle', async () => {
    const sender = createIdentityKeys()
    const file = await sealSnippets(BUNDLE, 'pw', sender)
    const trusted = [
      { fingerprint: sender.pub.fingerprint, label: 'Sender', sign: sender.pub.sign }
    ]
    expect(await openSnippets(file, 'pw', trusted)).toEqual({
      ok: true,
      bundle: BUNDLE,
      signer: sender.pub.fingerprint
    })
  })
})
