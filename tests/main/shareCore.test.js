// The testable half of share.js: the identity guard and the validation the
// config-restore path applies before it writes anything. Both were previously
// inside the Electron-importing glue, which is why the gaps below survived.
import { describe, expect, it, vi } from 'vitest'
import { createIdentityKeys } from '../../src/main/sealing'
import {
  IdentityUnavailable,
  guardIdentity,
  validateRestoredConfig,
  VAULT_LIMITS
} from '../../src/main/shareCore'

const trustedFrom = (keys, label = 'peer') => ({
  fingerprint: keys.pub.fingerprint,
  label,
  sign: keys.pub.sign,
  box: keys.pub.box
})

describe('guardIdentity', () => {
  it('turns a locked keychain into an error object, not a rejected promise', async () => {
    const guarded = guardIdentity(async () => {
      throw new IdentityUnavailable()
    })
    await expect(guarded()).resolves.toEqual({ error: 'identity-unavailable' })
  })

  it('passes every other failure through untouched', async () => {
    const boom = new Error('disk on fire')
    const guarded = guardIdentity(async () => {
      throw boom
    })
    await expect(guarded()).rejects.toBe(boom)
  })

  it('forwards arguments and the result', async () => {
    const fn = vi.fn(async (a, b) => a + b)
    await expect(guardIdentity(fn)(2, 3)).resolves.toBe(5)
    expect(fn).toHaveBeenCalledWith(2, 3)
  })
})

// Rule 6: a decryptable backup is still untrusted input. The restore path used
// to write `trusted` straight to disk, which is what let an unparseable key
// reach openSealed and throw out of every sealed import.
describe('validateRestoredConfig', () => {
  it('accepts a well-formed identity and trust list', () => {
    const me = createIdentityKeys()
    const peer = createIdentityKeys()
    const res = validateRestoredConfig({
      identity: { priv: me.priv, pub: me.pub },
      trusted: [trustedFrom(peer)]
    })
    expect(res.error).toBeUndefined()
    expect(res.trusted).toHaveLength(1)
  })

  it('rejects a trusted entry whose sign key is not a PEM', () => {
    const peer = createIdentityKeys()
    const res = validateRestoredConfig({
      trusted: [{ ...trustedFrom(peer), sign: 'not a PEM' }]
    })
    expect(res.error).toBe('malformed')
  })

  it('rejects a trusted entry whose fingerprint does not match its keys', () => {
    const peer = createIdentityKeys()
    const other = createIdentityKeys()
    const res = validateRestoredConfig({
      trusted: [{ ...trustedFrom(peer), fingerprint: other.pub.fingerprint }]
    })
    expect(res.error).toBe('malformed')
  })

  it('rejects an identity whose public key will not parse', () => {
    const me = createIdentityKeys()
    const res = validateRestoredConfig({
      identity: { priv: me.priv, pub: { ...me.pub, sign: 'garbage' } }
    })
    expect(res.error).toBe('malformed')
  })

  it('rejects an identity whose halves do not belong together', () => {
    const me = createIdentityKeys()
    const other = createIdentityKeys()
    const res = validateRestoredConfig({
      identity: { priv: me.priv, pub: { ...other.pub, fingerprint: me.pub.fingerprint } }
    })
    expect(res.error).toBe('malformed')
  })

  it('drops a non-array trust list rather than writing it', () => {
    expect(validateRestoredConfig({ trusted: { not: 'an array' } }).trusted).toBe(null)
  })

  it('reports an oversized snippet bundle as too-large, not malformed', () => {
    const res = validateRestoredConfig({ snippets: {} }, { snippetError: () => 'too-large' })
    expect(res.error).toBe('too-large')
  })
})

// A restored `vault` is a file off disk exactly like `snippets` beside it, and
// gets the same treatment: main vets it before the renderer is handed anything
// to re-encrypt. Without caps a crafted backup drives an unbounded loop of
// vaultEncrypt round-trips in the renderer.
describe('validateRestoredConfig — the vault bundle', () => {
  const diff = (over = {}) => ({ name: 'a diff', payload: { mode: 'paste' }, tags: [], ...over })
  const vet = (vault) => validateRestoredConfig({ vault })

  it('accepts a well-formed bundle and hands it back', () => {
    const vault = { diffs: [diff(), diff({ name: 'another' })] }
    expect(vet(vault)).toMatchObject({ vault })
  })

  it('treats a missing vault as nothing to restore, not an error', () => {
    expect(validateRestoredConfig({}).vault).toBeNull()
  })

  it('refuses a bundle that is not the shape it claims', () => {
    expect(vet('nope').error).toBe('malformed')
    expect(vet({ diffs: 'nope' }).error).toBe('malformed')
    expect(vet({ diffs: [null] }).error).toBe('malformed')
    expect(vet({ diffs: [{ name: 'no payload' }] }).error).toBe('malformed')
    expect(vet({ diffs: [diff({ payload: 'not an object' })] }).error).toBe('malformed')
  })

  it('caps how many diffs a backup may carry', () => {
    expect(vet({ diffs: Array.from({ length: VAULT_LIMITS.diffs }, () => diff()) }).error).toBe(
      undefined
    )
    expect(vet({ diffs: Array.from({ length: VAULT_LIMITS.diffs + 1 }, () => diff()) }).error).toBe(
      'malformed'
    )
  })

  it('caps a diff name so one entry cannot carry a megabyte', () => {
    expect(vet({ diffs: [diff({ name: 'x'.repeat(VAULT_LIMITS.nameBytes + 1) })] }).error).toBe(
      'malformed'
    )
  })

  it('refuses tags that are not a bounded list of strings', () => {
    expect(vet({ diffs: [diff({ tags: 'infra' })] }).error).toBe('malformed')
    expect(vet({ diffs: [diff({ tags: [1, 2] })] }).error).toBe('malformed')
    expect(
      vet({ diffs: [diff({ tags: Array.from({ length: 50 }, (_, i) => `t${i}`) })] }).error
    ).toBe('malformed')
  })
})
