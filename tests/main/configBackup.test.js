import { describe, expect, it } from 'vitest'
import { createCipheriv, scryptSync } from 'crypto'
import { CONFIG_FORMAT, openConfig, sealConfig } from '../../src/main/configBackup'

const BUNDLE = {
  identity: { priv: { sign: 'x', box: 'y' }, pub: { fingerprint: 'abc' } },
  trusted: [{ fingerprint: 'def', label: 'Alice' }],
  snippets: { categories: [{ name: 'SQL', snippets: [{ name: 'q', content: 'SELECT 1' }] }] },
  settings: { theme: 'light' }
}

describe('sealConfig / openConfig', () => {
  it('round-trips the full bundle with the right passphrase', () => {
    const blob = sealConfig(BUNDLE, 'pw')
    expect(openConfig(blob, 'pw')).toEqual({ ok: true, bundle: BUNDLE })
  })

  it('carries the versioned format tag', () => {
    const env = JSON.parse(Buffer.from(sealConfig(BUNDLE, 'pw'), 'base64').toString())
    expect(env.format).toBe(CONFIG_FORMAT)
  })

  it('fails on the wrong passphrase', () => {
    const blob = sealConfig(BUNDLE, 'right')
    expect(openConfig(blob, 'wrong')).toEqual({ ok: false, error: 'wrong-passphrase' })
  })

  it('detects tampering (GCM auth tag)', () => {
    const env = JSON.parse(Buffer.from(sealConfig(BUNDLE, 'pw'), 'base64').toString())
    const bytes = Buffer.from(env.ciphertext, 'base64')
    bytes[0] ^= 0xff
    env.ciphertext = bytes.toString('base64')
    const tampered = Buffer.from(JSON.stringify(env)).toString('base64')
    expect(openConfig(tampered, 'pw').ok).toBe(false)
  })

  it('rejects a non-config blob', () => {
    expect(openConfig('garbage', 'pw')).toEqual({ ok: false, error: 'not-a-config-file' })
    expect(openConfig(Buffer.from('{}').toString('base64'), 'pw')).toEqual({
      ok: false,
      error: 'not-a-config-file'
    })
  })

  it('rejects a config blob whose format tag is wrong', () => {
    const salt = Buffer.alloc(16)
    const key = scryptSync('pw', salt, 32)
    const iv = Buffer.alloc(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const ct = Buffer.concat([cipher.update('{}'), cipher.final()])
    const env = {
      format: 'other',
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ct.toString('base64')
    }
    const blob = Buffer.from(JSON.stringify(env)).toString('base64')
    expect(openConfig(blob, 'pw')).toEqual({ ok: false, error: 'not-a-config-file' })
  })
})
