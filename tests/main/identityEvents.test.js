import { describe, expect, it, vi } from 'vitest'
import { identityPersisted, onIdentityPersisted } from '../../src/main/identityEvents'

describe('identity events', () => {
  it('tells every listener when the identity is written', () => {
    const a = vi.fn()
    const b = vi.fn()
    onIdentityPersisted(a)
    onIdentityPersisted(b)
    identityPersisted()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })
})
