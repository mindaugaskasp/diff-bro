import { describe, it, expect } from 'vitest'
import {
  uuidV1,
  uuidV4,
  uuidV5,
  uuidV6,
  uuidV7,
  formatUuid,
  uuidInfo,
  toCanonicalUuid,
  UUID_NAMESPACES
} from '../../../src/renderer/src/utils/uuid'

const V_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('uuid generation', () => {
  it('v4 is random, well-formed, and stamped version 4 / RFC 4122', () => {
    const a = uuidV4()
    expect(a).toMatch(V_RE)
    expect(uuidInfo(a)).toEqual({ version: 4, variant: 'RFC 4122' })
    expect(uuidV4()).not.toBe(a)
  })

  it('v1 and v6 carry their version and variant', () => {
    expect(uuidInfo(uuidV1()).version).toBe(1)
    expect(uuidInfo(uuidV6()).version).toBe(6)
    expect(uuidInfo(uuidV1()).variant).toBe('RFC 4122')
  })

  it('v7 is time-ordered — a later timestamp sorts after an earlier one', () => {
    const early = uuidV7(1_000_000_000_000)
    const late = uuidV7(2_000_000_000_000)
    expect(early < late).toBe(true)
    expect(uuidInfo(early).version).toBe(7)
  })

  it('v6 is time-ordered too', () => {
    expect(uuidV6(1_000_000_000_000) < uuidV6(2_000_000_000_000)).toBe(true)
  })

  it('v5 is deterministic and matches the documented DNS/python.org vector', async () => {
    const u = await uuidV5(UUID_NAMESPACES.DNS, 'python.org')
    expect(u).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d')
    expect(await uuidV5(UUID_NAMESPACES.DNS, 'python.org')).toBe(u)
    expect(await uuidV5(UUID_NAMESPACES.DNS, 'other')).not.toBe(u)
    expect(uuidInfo(u).version).toBe(5)
  })
})

describe('formatUuid', () => {
  const U = '886313e1-3b8a-5372-9b90-0c9aee199e5d'
  it('renders each form and the upper-case option', () => {
    expect(formatUuid(U)).toBe(U)
    expect(formatUuid(U, { form: 'hex' })).toBe('886313e13b8a53729b900c9aee199e5d')
    expect(formatUuid(U, { form: 'urn' })).toBe(`urn:uuid:${U}`)
    expect(formatUuid(U, { form: 'braced' })).toBe(`{${U}}`)
    expect(formatUuid(U, { upper: true })).toBe(U.toUpperCase())
  })
})

describe('toCanonicalUuid (reverse convert)', () => {
  const U = '886313e1-3b8a-5372-9b90-0c9aee199e5d'
  it('normalizes any accepted form back to canonical', () => {
    expect(toCanonicalUuid('886313e13b8a53729b900c9aee199e5d')).toBe(U) // 32-hex
    expect(toCanonicalUuid(`{${U}}`)).toBe(U) // braced
    expect(toCanonicalUuid(`urn:uuid:${U}`)).toBe(U) // urn
    expect(toCanonicalUuid('0X886313E13B8A53729B900C9AEE199E5D')).toBe(U) // 0x + upper
    expect(toCanonicalUuid(U)).toBe(U) // canonical passes through
    expect(toCanonicalUuid('nope')).toBe('')
  })
})
