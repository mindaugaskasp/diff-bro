import { describe, expect, it } from 'vitest'
import { createCipheriv, createDecipheriv, scryptSync } from 'crypto'
import { createIdentityKeys } from '../src/main/sealing'
import { openSnippets, sealSnippets, SNIPPET_FORMAT } from '../src/main/snippetSealing'

const BUNDLE = {
  categories: [
    { name: 'SQL', snippets: [{ name: 'find user', content: 'SELECT * FROM users' }] },
    { name: 'Notes', snippets: [{ name: 'todo', content: '# Todo\n- [ ] ship it' }] }
  ]
}

describe('sealSnippets / openSnippets', () => {
  it('round-trips a bundle with the correct passphrase', () => {
    const sender = createIdentityKeys()
    const file = sealSnippets(BUNDLE, 'correct horse battery staple', sender)
    const result = openSnippets(file, 'correct horse battery staple')
    expect(result).toEqual({ ok: true, bundle: BUNDLE, signer: sender.pub.fingerprint })
  })

  it('carries the expected format tag', () => {
    const sender = createIdentityKeys()
    const file = sealSnippets(BUNDLE, 'pw', sender)
    expect(file.format).toBe(SNIPPET_FORMAT)
  })

  it('fails to open with the wrong passphrase', () => {
    const sender = createIdentityKeys()
    const file = sealSnippets(BUNDLE, 'right-passphrase', sender)
    const result = openSnippets(file, 'wrong-passphrase')
    expect(result.ok).toBeUndefined()
    expect(result.error).toBeTruthy()
  })

  it('rejects a file with a tampered ciphertext (GCM auth tag)', () => {
    const sender = createIdentityKeys()
    const file = sealSnippets(BUNDLE, 'pw', sender)
    const bytes = Buffer.from(file.ciphertext, 'base64')
    bytes[0] ^= 0xff
    file.ciphertext = bytes.toString('base64')
    expect(openSnippets(file, 'pw').ok).toBeUndefined()
  })

  it('rejects a file whose signature does not match the embedded key (forged after signing)', () => {
    // Sign with alice, then splice in bob's public key to try to make the
    // signature look like it came from someone else — decrypts fine (same
    // passphrase), but signature verification against the swapped key fails.
    const alice = createIdentityKeys()
    const bob = createIdentityKeys()
    const file = sealSnippets(BUNDLE, 'pw', alice)

    // Re-encrypt an envelope with bob's key substituted for alice's, reusing
    // the same salt/iv so decryption still succeeds and only the embedded
    // signerKey differs.
    const salt = Buffer.from(file.salt, 'base64')
    const key = scryptSync('pw', salt, 32)
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

    expect(openSnippets(tampered, 'pw')).toEqual({ error: 'bad-signature' })
  })

  it('rejects a file with an unrecognized format tag', () => {
    expect(openSnippets({ format: 'something-else' }, 'pw')).toEqual({
      error: 'not-a-snippet-file'
    })
  })

  it('rejects malformed input without throwing', () => {
    expect(openSnippets(null, 'pw')).toEqual({ error: 'not-a-snippet-file' })
    expect(openSnippets({}, 'pw')).toEqual({ error: 'not-a-snippet-file' })
    expect(() => openSnippets('not an object', 'pw')).not.toThrow()
  })
})
